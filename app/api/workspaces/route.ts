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
