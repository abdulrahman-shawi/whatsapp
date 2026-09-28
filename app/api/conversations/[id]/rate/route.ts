import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// تقييم رد الذكاء الاصطناعي من صفحة التدريب: GOOD أو NEEDS_IMPROVEMENT
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { messageId, rating } = body ?? {};
  if (
    typeof messageId !== "string" ||
    !["GOOD", "NEEDS_IMPROVEMENT"].includes(rating)
  ) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  // التأكد أن الرسالة تتبع محادثة ضمن مساحة عمل المستخدم
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      conversationId: params.id,
      conversation: { workspaceId: ctx.workspaceId },
    },
    select: { id: true },
  });
  if (!message) {
    return NextResponse.json({ error: "الرسالة غير موجودة" }, { status: 404 });
  }

  await prisma.message.update({ where: { id: messageId }, data: { rating } });
  return NextResponse.json({ ok: true });
}
