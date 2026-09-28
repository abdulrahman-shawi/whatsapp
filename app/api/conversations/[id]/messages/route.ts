import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { triggerNewMessage, triggerConversationUpdated } from "@/lib/pusher";
import { getIntegration } from "@/lib/settings";

type Params = { params: { id: string } };

// تسلسل الرسالة للعميل (تواريخ كنصوص)
function serialize(m: {
  id: string;
  direction: string;
  body: string;
  senderType: string;
  isRead: boolean;
  createdAt: Date;
}) {
  return { ...m, createdAt: m.createdAt.toISOString() };
}

// جلب رسائل المحادثة (تصاعدياً) — ?since= للاستطلاع التزايدي
// يحدّث الرسائل الواردة غير المقروءة إلى مقروءة
export async function GET(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  if (sinceParam && (!since || isNaN(since.getTime()))) {
    return NextResponse.json({ error: "قيمة since غير صالحة" }, { status: 400 });
  }

  // تعليم الوارد كمقروء قبل الجلب
  await prisma.message.updateMany({
    where: { conversationId: params.id, direction: "INBOUND", isRead: false },
    data: { isRead: true },
  });

  const messages = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ messages: messages.map(serialize) });
}

// إرسال رسالة يدوية من الموظف — وتحاول الإرسال عبر واتساب لمحادثات WHATSAPP
export async function POST(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = body?.body;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "نص الرسالة مطلوب" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    include: { contact: { select: { waPhone: true } } },
  });
  if (!conversation) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: {
      conversationId: params.id,
      direction: "OUTBOUND",
      senderType: "HUMAN",
      body: text.trim(),
    },
  });
  await prisma.conversation.update({
    where: { id: params.id },
    data: { lastMessageAt: new Date() },
  });

  // بث فوري عبر Pusher — لا يؤثر على شيء إن لم يكن مفعّلاً
  triggerNewMessage(ctx.workspaceId, params.id, serialize(message));
  triggerConversationUpdated(ctx.workspaceId, params.id);

  // الإرسال الخارجي لواتساب فقط — الفشل لا يمنع حفظ الرسالة
  // بيانات الاعتماد من إعدادات مساحة العمل مع .env كبديل
  let waSent: boolean | null = null;
  if (conversation.platform === "WHATSAPP") {
    const [token, phoneNumberId] = await Promise.all([
      getIntegration(ctx.workspaceId, "WHATSAPP_TOKEN"),
      getIntegration(ctx.workspaceId, "WHATSAPP_PHONE_NUMBER_ID"),
    ]);
    waSent = await sendWhatsAppMessage(
      conversation.contact.waPhone,
      text.trim(),
      token && phoneNumberId ? { token, phoneNumberId } : null
    );
  }

  return NextResponse.json(
    { message: serialize(message), waSent },
    { status: 201 }
  );
}
