import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// قائمة أعضاء مساحة العمل + الدعوات المعلّقة (أي عضو يستطيع القراءة)
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const [members, invites] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.workspaceInvite.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    members: members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
    invites: invites.map((i) => ({ id: i.id, token: i.token, role: i.role })),
    currentUserId: ctx.userId,
    myRole: ctx.role,
  });
}
