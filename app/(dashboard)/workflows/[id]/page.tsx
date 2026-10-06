import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";

export const dynamic = "force-dynamic";

// تعديل سير عمل موجود + سجل آخر التشغيلات
export default async function EditWorkflowPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  const [workflow, members, templates] = await Promise.all([
    prisma.workflow.findFirst({
      where: { id: params.id, workspaceId: ctx.workspaceId },
      include: { runs: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
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
  ]);
  if (!workflow) notFound();

  return (
    <WorkflowBuilder
      workflow={{
        id: workflow.id,
        name: workflow.name,
        trigger: workflow.trigger,
        triggerConfig: workflow.triggerConfig,
        steps: workflow.steps,
        isActive: workflow.isActive,
      }}
      runs={workflow.runs.map((r) => ({
        id: r.id,
        status: r.status,
        logs: r.logs,
        createdAt: r.createdAt.toISOString(),
      }))}
      members={members.map((m) => ({ id: m.user.id, name: m.user.name }))}
      templates={templates}
    />
  );
}
