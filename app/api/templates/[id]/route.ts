import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fireOutboundEvent } from "@/lib/outbound-webhooks";

// حذف قالب من مساحة العمل
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الحذف للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.template.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
  }

  await prisma.template.delete({ where: { id: params.id } });
  // ويب هوك صادر: حذف القالب
  fireOutboundEvent(ctx.workspaceId, "template.deleted", {
    id: existing.id,
    name: existing.name,
    language: existing.language,
  });
  return NextResponse.json({ ok: true });
}
