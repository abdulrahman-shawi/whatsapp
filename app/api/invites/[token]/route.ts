import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// معلومات دعوة للعرض في صفحة التسجيل — عامة (التوكن نفسه سرّي)
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const invite = await prisma.workspaceInvite.findUnique({
    where: { token: params.token },
    include: { workspace: { select: { name: true } } },
  });
  if (!invite) {
    return NextResponse.json({ error: "دعوة غير صالحة أو منتهية" }, { status: 404 });
  }
  return NextResponse.json({
    workspaceName: invite.workspace.name,
    role: invite.role,
  });
}
