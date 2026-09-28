import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleIncomingWidgetMessage } from "@/lib/agent-engine";

// واجهة عامة للويدجت المضمّن في مواقع العملاء — بدون جلسة، CORS مفتوح
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: CORS });
}

// طلبات preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// إرسال رسالة زائر → تمريرها لمحرك الوكيل وإعادة الرد
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { agentId, visitorId, text, conversationId } = body ?? {};

  if (
    typeof agentId !== "string" ||
    typeof visitorId !== "string" ||
    !visitorId.trim() ||
    typeof text !== "string" ||
    !text.trim() ||
    (conversationId !== undefined && typeof conversationId !== "string")
  ) {
    return json({ error: "طلب غير صالح" }, { status: 400 });
  }

  // الوكيل يجب أن يكون موجوداً ومفعّلاً
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, isActive: true },
    select: { id: true, workspaceId: true },
  });
  if (!agent) {
    return json({ error: "الوكيل غير متاح" }, { status: 404 });
  }

  const result = await handleIncomingWidgetMessage({
    workspaceId: agent.workspaceId,
    agentId: agent.id,
    visitorId: visitorId.trim(),
    visitorName: `زائر ${visitorId.slice(0, 6)}`,
    text: text.trim(),
    conversationId,
  });

  if (!result) {
    return json({ error: "تعذّرت المعالجة" }, { status: 500 });
  }

  // status تتيح للويدجت إظهار تنبيه التحويل لموظف عند HANDED_OFF
  return json({
    reply: result.reply,
    conversationId: result.conversationId,
    status: result.status,
    replyMessage: result.replyMessage ?? null,
  });
}

// استطلاع ردود جديدة (بما فيها ردود الموظفين من صندوق الوارد)
// ملاحظة MVP: أي شخص يملك conversationId يستطيع القراءة — المعرّف عشوائي طويل
export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  const sinceParam = url.searchParams.get("since");

  if (!conversationId) {
    return json({ error: "conversationId مطلوب" }, { status: 400 });
  }
  const since = sinceParam ? new Date(sinceParam) : null;
  if (sinceParam && (!since || isNaN(since.getTime()))) {
    return json({ error: "قيمة since غير صالحة" }, { status: 400 });
  }

  // نتأكد أنها محادثة ويدجت فعلاً
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, platform: "WIDGET" },
    select: { id: true, status: true },
  });
  if (!conversation) {
    return json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      direction: "OUTBOUND",
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, senderType: true, createdAt: true },
  });

  return json({
    status: conversation.status,
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
