import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// مساحات عمل المستخدم مع أدواره فيها (لقائمة التبديل)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    include: { workspace: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    workspaces: memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
    })),
  });
}

// تحديث تفضيلات مساحة العمل — للمالك فقط
// الحالية: restrictStaff (الموظف يرى محادثاته المسندة إليه فقط)
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
  });
  const requestedId = req.headers.get("x-workspace-id");
  const membership =
    memberships.find((m) => m.workspaceId === requestedId) ?? memberships[0];
  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const data: { restrictStaff?: boolean } = {};
  if (typeof body?.restrictStaff === "boolean") {
    data.restrictStaff = body.restrictStaff;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "لا توجد حقول صالحة" }, { status: 400 });
  }

  await prisma.workspace.update({
    where: { id: membership.workspaceId },
    data,
  });

  return NextResponse.json({ ok: true });
}
