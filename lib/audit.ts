import { prisma } from "@/lib/prisma";

// سجل التدقيق: من فعل ماذا ومتى — لا يفشل العملية أبداً إذا تعذر التسجيل
export async function logAudit(opts: {
  workspaceId: string;
  userId?: string | null;
  action: string; // ASSIGN | CLOSE | REOPEN | DELETE | UPDATE | CREATE | SEND
  entity: string; // conversation | workflow | broadcast | member | setting | form | agent | webhook
  entityId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    let userName: string | null = null;
    if (opts.userId) {
      const user = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: { name: true },
      });
      userName = user?.name ?? null;
    }
    await prisma.auditLog.create({
      data: {
        workspaceId: opts.workspaceId,
        userId: opts.userId ?? null,
        userName,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        meta: opts.meta as import("@prisma/client").Prisma.InputJsonValue | undefined,
      },
    });
  } catch (e) {
    console.error("[audit] تعذر تسجيل الحدث:", e);
  }
}
