import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AgentStudio } from "@/components/agents/agent-studio";
import { AgentVersions } from "@/components/agents/agent-versions";

export const dynamic = "force-dynamic";

// تعديل وكيل موجود — يُجلب مع مصادر معرفته إلى الاستوديو
export default async function EditAgentPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    include: { knowledgeSources: { orderBy: { createdAt: "asc" } } },
  });
  if (!agent) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AgentStudio
        agent={{
          id: agent.id,
          name: agent.name,
          systemPrompt: agent.systemPrompt,
          welcomeMessage: agent.welcomeMessage,
          offHoursReply: agent.offHoursReply,
          responseDelaySec: agent.responseDelaySec,
          voiceReplies: agent.voiceReplies,
          handoffKeywords: agent.handoffKeywords,
          isActive: agent.isActive,
          updatedAt: agent.updatedAt.toISOString(),
          instructions: Array.isArray(agent.instructions)
            ? agent.instructions
                .filter(
                  (b): b is { id?: string; title: string; content: string } =>
                    Boolean(b) &&
                    typeof b === "object" &&
                    typeof (b as { title?: unknown }).title === "string" &&
                    typeof (b as { content?: unknown }).content === "string"
                )
                .map((b, i) => ({
                  id:
                    typeof b.id === "string" && b.id
                      ? b.id
                      : `block-${i}`,
                  title: b.title,
                  content: b.content,
                }))
            : [],
          skills: Array.isArray(agent.skills)
            ? agent.skills.filter((k): k is string => typeof k === "string")
            : [],
          knowledgeSources: agent.knowledgeSources.map((s) => ({
            id: s.id,
            title: s.title,
            type: s.type,
            content: s.content,
            url: s.url,
            lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
          })),
        }}
      />
      <AgentVersions agentId={agent.id} />
    </div>
  );
}
