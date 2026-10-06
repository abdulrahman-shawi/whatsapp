import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WorkflowsClient } from "@/components/workflows/workflows-client";

export const dynamic = "force-dynamic";

// قائمة سير العمل: الاسم، المحفّز، الخطوات، الحالة، المنشئ
export default async function WorkflowsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  const workflows = await prisma.workflow.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { runs: true } },
    },
  });

  return <WorkflowsClient workflows={workflows} />;
}
