import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// تبديل مساحة العمل الحالية: نتحقق من العضوية ثم نضبط كوكي "ws"
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const workspaceId = body?.workspaceId;
  if (typeof workspaceId !== "string" || !workspaceId) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: ctx.userId, workspaceId },
  });
  if (!membership) {
    return NextResponse.json(
      { error: "أنت لست عضواً في هذه المساحة" },
      { status: 403 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("ws", workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
