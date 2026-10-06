import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";

export const dynamic = "force-dynamic";

// إنشاء سير عمل جديد
export default async function NewWorkflowPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  const [members, templates, agents, dbSources] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { role: "asc" },
    }),
    prisma.template.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agent.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.knowledgeSource.findMany({
      where: { type: "DB", agent: { workspaceId: ctx.workspaceId } },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <WorkflowBuilder
      members={members.map((m) => ({ id: m.user.id, name: m.user.name }))}
      templates={templates}
      agents={agents}
      dbSources={dbSources}
    />
  );
}
