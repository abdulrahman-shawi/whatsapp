import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

// موعد متابعة المحادثة — يظهر في قائمة "متابعات" بالوارد
// POST { followUpAt: ISO | null } — القيمة null تمسح الموعد
export async function POST(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  let body: { followUpAt?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const value = body.followUpAt ? new Date(body.followUpAt) : null;
  if (value && isNaN(value.getTime())) {
    return NextResponse.json({ error: "موعد غير صالح" }, { status: 400 });
  }

  await prisma.conversation.update({
    where: { id: params.id },
    data: { followUpAt: value },
  });
  return NextResponse.json({ ok: true, followUpAt: value ? value.toISOString() : null });
}
