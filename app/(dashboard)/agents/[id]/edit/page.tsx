import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AgentForm } from "@/components/agents/agent-form";

export const dynamic = "force-dynamic";

// تعديل وكيل موجود — يُجلب مع مصادر معرفته
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
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">تعديل: {agent.name}</h1>
      <AgentForm
        agent={{
          id: agent.id,
          name: agent.name,
          systemPrompt: agent.systemPrompt,
          welcomeMessage: agent.welcomeMessage,
          responseDelaySec: agent.responseDelaySec,
          handoffKeywords: agent.handoffKeywords,
          isActive: agent.isActive,
          knowledgeSources: agent.knowledgeSources.map((s) => ({
            id: s.id,
            title: s.title,
            type: s.type,
            content: s.content,
          })),
        }}
      />
    </div>
  );
}
