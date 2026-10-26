// تشخيص سبب توقف الرد الآلي: مفتاح AI، حدود الباقة، حالة الوكيل
// التشغيل: npx tsx scripts/diag-ai.ts
import { prisma } from "../lib/prisma";
import { resolveAiConfig } from "../lib/openai";
import { getUsageStatus, getWorkspacePlan } from "../lib/billing/plans";
import { resolveWhatsAppCreds } from "../lib/whatsapp";
import { getIntegration } from "../lib/settings";

async function main() {
  const workspace = await prisma.workspace.findFirst({
    include: { agents: true },
  });
  if (!workspace) {
    console.log("لا توجد مساحة عمل!");
    return;
  }
  console.log("المساحة:", workspace.id, workspace.name);

  const plan = await getWorkspacePlan(workspace.id);
  console.log("الباقة:", plan.code, plan.name, `(${plan.messageLimit} رسالة / ${plan.tokenLimit} توكن)`);

  const usage = await getUsageStatus(workspace.id);
  console.log(
    "الاستهلاك الشهري:",
    `${usage.used}/${usage.limit} رسالة (متبقي ${usage.remaining}) —`,
    `${usage.tokens.used}/${usage.tokens.limit} توكن (متبقي ${usage.tokens.remaining})`
  );

  const ai = await resolveAiConfig();
  console.log("إعدادات AI:", {
    apiKey: ai.apiKey ? `مضبوط (${ai.apiKey.slice(0, 8)}…)` : "❌ غير مضبوط",
    baseUrl: ai.baseUrl,
    model: ai.model,
  });

  const creds = await resolveWhatsAppCreds(workspace.id);
  console.log("مزود واتساب:", creds?.provider ?? "❌ غير مضبوط");

  const waToken = await getIntegration(workspace.id, "WHATSAPP_TOKEN");
  const instance = await getIntegration(workspace.id, "ULTRAMSG_INSTANCE_ID");
  console.log("WHATSAPP_TOKEN:", waToken ? "مضبوط" : "فارغ", "| ULTRAMSG_INSTANCE:", instance ? "مضبوط" : "فارغ");

  for (const agent of workspace.agents) {
    console.log("الوكيل:", {
      id: agent.id,
      name: agent.name,
      isActive: agent.isActive,
      responseDelaySec: agent.responseDelaySec,
      hasWelcome: !!agent.welcomeMessage,
      handoffKeywords: agent.handoffKeywords,
    });
  }

  // آخر 5 محادثات وحالتها
  const convos = await prisma.conversation.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { lastMessageAt: "desc" },
    take: 5,
    include: { contact: { select: { name: true, waPhone: true } } },
  });
  for (const c of convos) {
    console.log("محادثة:", c.contact.name ?? c.contact.waPhone, "| الحالة:", c.status, "| أرشفة:", c.isArchived, "| مغلقة:", !!c.closedAt);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
