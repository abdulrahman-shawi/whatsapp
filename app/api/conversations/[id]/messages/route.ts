import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  resolveWhatsAppCreds,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";
import { triggerNewMessage, triggerConversationUpdated } from "@/lib/pusher";
import { getStaffRestrictionFilter } from "@/lib/conversations";

type Params = { params: { id: string } };

// تسلسل الرسالة للعميل (تواريخ كنصوص)
function serialize(m: {
  id: string;
  direction: string;
  body: string;
  senderType: string;
  isNote: boolean;
  isRead: boolean;
  mediaId: string | null;
  mediaMime: string | null;
  mediaType: string | null;
  rating: string | null;
  createdAt: Date;
  sender?: { name: string } | null;
}) {
  return {
    id: m.id,
    direction: m.direction,
    body: m.body,
    senderType: m.senderType,
    isNote: m.isNote,
    isRead: m.isRead,
    mediaId: m.mediaId,
    mediaMime: m.mediaMime,
    mediaType: m.mediaType,
    rating: m.rating,
    createdAt: m.createdAt.toISOString(),
    senderName: m.sender?.name ?? null,
  };
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

  // قيود الموظف: عند تفعيل التقييد لا يرى الموظف سوى محادثاته المسندة إليه
  const restrictToUserId = await getStaffRestrictionFilter(
    ctx.workspaceId,
    ctx.role,
    ctx.userId
  );
  if (restrictToUserId) {
    const assigned = await prisma.conversationAssignee.findFirst({
      where: { conversationId: params.id, userId: restrictToUserId },
      select: { conversationId: true },
    });
    if (!assigned) {
      return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
    }
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
    include: { sender: { select: { name: true } } },
  });

  return NextResponse.json({ messages: messages.map(serialize) });
}

// إرسال رسالة يدوية من الموظف — وتحاول الإرسال عبر واتساب لمحادثات WHATSAPP
// isNote=true تحفظ ملاحظة داخلية فقط ولا تُرسل للعميل
// template={id, params} يرسل قالباً معتمداً في ميتا بدل رسالة نصية حرة
export async function POST(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = body?.body;
  const isNote = body?.isNote === true;
  const templateReq = body?.template;

  // وضع القالب: التحقق من المدخلات وجلب القالب من مساحة العمل
  let template: { name: string; language: string; body: string } | null = null;
  let paramsList: string[] = [];
  if (templateReq && typeof templateReq === "object") {
    if (isNote) {
      return NextResponse.json(
        { error: "الملاحظات الداخلية نصية فقط" },
        { status: 400 }
      );
    }
    template = await prisma.template.findFirst({
      where: { id: templateReq.id, workspaceId: ctx.workspaceId },
    });
    if (!template) {
      return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
    }
    paramsList = Array.isArray(templateReq.params)
      ? templateReq.params.map(String)
      : [];
  }

  // نص المعاينة المخزن: استبدال متغيرات القالب {{1}} {{2}}... بقيمها
  const preview = template
    ? template.body.replace(/\{\{(\d+)\}\}/g, (_, n) => {
        const idx = parseInt(n, 10) - 1;
        return paramsList[idx] ?? `{{${n}}}`;
      })
    : "";

  const bodyText =
    typeof text === "string" && text.trim() ? text.trim() : preview;
  if (!bodyText) {
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
      body: bodyText,
      isNote,
      senderId: ctx.userId,
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
  // الملاحظات الداخلية لا تُرسل أبداً
  let waSent: boolean | null = null;
  if (!isNote && conversation.platform === "WHATSAPP") {
    const creds = await resolveWhatsAppCreds(ctx.workspaceId);
    // القوالب ترسل عبر واجهة القوالب (خارج نافذة ٢٤ ساعة) — مزود ميتا فقط
    waSent = template
      ? await sendWhatsAppTemplate(
          conversation.contact.waPhone,
          { name: template.name, language: template.language, params: paramsList },
          creds
        )
      : await sendWhatsAppMessage(conversation.contact.waPhone, bodyText, creds);
  }

  return NextResponse.json(
    { message: serialize(message), waSent },
    { status: 201 }
  );
}
