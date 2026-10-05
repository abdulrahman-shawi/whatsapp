import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// إلغاء دعوة معلّقة — مالك مساحة العمل فقط
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الإلغاء للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.workspaceInvite.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الدعوة غير موجودة" }, { status: 404 });
  }

  await prisma.workspaceInvite.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
