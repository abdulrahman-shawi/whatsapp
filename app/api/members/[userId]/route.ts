import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

type Params = { params: { userId: string } };

// تغيير دور عضو — مالك مساحة العمل فقط، ولا يغيّر دور نفسه
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }
  if (params.userId === ctx.userId) {
    return NextResponse.json(
      { error: "لا يمكنك تغيير دورك أنت" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const role = body?.role;
  if (role !== "OWNER" && role !== "STAFF") {
    return NextResponse.json({ error: "دور غير صالح" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: params.userId, workspaceId: ctx.workspaceId },
  });
  if (!membership) {
    return NextResponse.json({ error: "العضو غير موجود" }, { status: 404 });
  }

  await prisma.workspaceMember.update({
    where: { userId_workspaceId: { userId: params.userId, workspaceId: ctx.workspaceId } },
    data: { role },
  });
  // تدقيق تغيير الدور
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "UPDATE",
    entity: "member",
    entityId: params.userId,
    meta: { role },
  });
  return NextResponse.json({ ok: true });
}

// إزالة عضو من مساحة العمل — مالك فقط، ولا يزيل نفسه أو مالكاً آخر
export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الإزالة للمالك فقط" }, { status: 403 });
  }
  if (params.userId === ctx.userId) {
    return NextResponse.json(
      { error: "لا يمكنك إزالة نفسك" },
      { status: 400 }
    );
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: params.userId, workspaceId: ctx.workspaceId },
  });
  if (!membership) {
    return NextResponse.json({ error: "العضو غير موجود" }, { status: 404 });
  }
  if (membership.role === "OWNER") {
    return NextResponse.json(
      { error: "لا يمكن إزالة مالك المساحة" },
      { status: 400 }
    );
  }

  await prisma.workspaceMember.delete({
    where: { userId_workspaceId: { userId: params.userId, workspaceId: ctx.workspaceId } },
  });
  // محادثاته المسندة إليه تُلغى إسنادها تلقائياً (onDelete: SetNull)
  // تدقيق إزالة العضو
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "DELETE",
    entity: "member",
    entityId: params.userId,
  });
  return NextResponse.json({ ok: true });
}
