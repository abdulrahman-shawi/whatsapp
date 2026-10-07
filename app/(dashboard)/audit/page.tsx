import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AuditClient, type AuditRow } from "@/components/audit/audit-client";

export const dynamic = "force-dynamic";

// سجل التدقيق: من فعل ماذا ومتى في مساحة العمل — المالك فقط
export default async function AuditPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  const logs = await prisma.auditLog.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const rows: AuditRow[] = logs.map((l) => ({
    id: l.id,
    userName: l.userName,
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
    meta: l.meta,
    createdAt: l.createdAt.toISOString(),
  }));

  return <AuditClient rows={rows} />;
}
