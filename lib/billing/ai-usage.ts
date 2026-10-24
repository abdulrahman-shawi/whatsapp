import { prisma } from "@/lib/prisma";
import { generateReply, type AiReply, type AiConfig, type AiErrorInfo, type AiTool, type ChatMessage } from "@/lib/openai";
import { getWorkspacePlan, getWorkspaceTrialStatus } from "@/lib/billing/plans";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function canReserveTokens(
  used: number,
  limit: number,
  requested: number
): boolean {
  return (
    Number.isInteger(used) &&
    Number.isInteger(limit) &&
    Number.isInteger(requested) &&
    used >= 0 &&
    limit >= 0 &&
    requested > 0 &&
    used <= limit - requested
  );
}

export type WorkspaceAiResult = {
  reply: AiReply | null;
  quotaExceeded: boolean;
  trialExpired: boolean;
};

export async function generateWorkspaceReply(
  workspaceId: string,
  messages: ChatMessage[],
  systemPrompt: string,
  knowledge: string[],
  config: AiConfig,
  maxTokens = 300,
  errorInfo?: AiErrorInfo,
  tools?: AiTool[]
): Promise<WorkspaceAiResult> {
  const trial = await getWorkspaceTrialStatus(workspaceId);
  if (trial.expired) {
    return { reply: null, quotaExceeded: false, trialExpired: true };
  }

  const plan = await getWorkspacePlan(workspaceId);
  const reservation = Math.max(1, maxTokens);
  if (reservation > plan.tokenLimit) {
    return { reply: null, quotaExceeded: true, trialExpired: false };
  }
  const month = currentMonth();
  const reserved = await prisma.$transaction(async (tx) => {
    await tx.usageRecord.upsert({
      where: { workspaceId_month: { workspaceId, month } },
      update: {},
      create: {
        workspaceId,
        month,
        messageLimit: plan.messageLimit,
        tokenLimit: plan.tokenLimit,
      },
    });
    const current = await tx.usageRecord.findUnique({
      where: { workspaceId_month: { workspaceId, month } },
      select: { tokensUsed: true },
    });
    if (
      !current ||
      !canReserveTokens(current.tokensUsed, plan.tokenLimit, reservation)
    ) {
      return false;
    }
    const updated = await tx.usageRecord.updateMany({
      where: {
        workspaceId,
        month,
        tokensUsed: { lte: plan.tokenLimit - reservation },
      },
      data: { tokensUsed: { increment: reservation } },
    });
    return updated.count === 1;
  });
  if (!reserved) {
    return { reply: null, quotaExceeded: true, trialExpired: false };
  }

  let reply: AiReply | null = null;
  try {
    reply = await generateReply(messages, systemPrompt, knowledge, config, maxTokens, errorInfo, { tools });
    return { reply, quotaExceeded: false, trialExpired: false };
  } finally {
    const actualTokens = Math.min(reply?.usage.totalTokens ?? 0, reservation);
    await prisma.usageRecord.update({
      where: { workspaceId_month: { workspaceId, month } },
      data: { tokensUsed: { decrement: reservation - actualTokens } },
    });
  }
}
