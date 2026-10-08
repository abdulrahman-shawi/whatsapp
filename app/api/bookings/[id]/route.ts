import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { fireOutboundEvent } from "@/lib/outbound-webhooks";

type Params = { params: { id: string } };

// حذف حجز نهائياً — لا يؤثر على جهة الاتصال المرتبطة
export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const existing = await prisma.booking.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true, title: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "الحجز غير موجود" }, { status: 404 });
  }

  await prisma.booking.delete({ where: { id: params.id } });
  // تدقيق حذف الحجز
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "DELETE",
    entity: "booking",
    entityId: params.id,
    meta: { title: existing.title },
  });
  // ويب هوك صادر: حذف الحجز
  fireOutboundEvent(ctx.workspaceId, "booking.deleted", {
    id: existing.id,
    title: existing.title,
  });
  return NextResponse.json({ ok: true });
}
