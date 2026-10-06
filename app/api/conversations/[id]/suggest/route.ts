import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { generateReply, resolveAiConfig, type ChatMessage } from "@/lib/openai";
import { collectAgentKnowledge } from "@/lib/retrieval";

// اقتراح رد ذكي بناءً على تعليمات الوكيل ومصادر المعرفة وآخر ١٠ رسائل
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    include: {
      agent: { include: { knowledgeSources: true } },
      contact: { select: { waPhone: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!conversation) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  // ترتيب الرسائل زمنياً وتحويلها لصيغة OpenAI
  const history: ChatMessage[] = conversation.messages
    .slice()
    .reverse()
    .map((m) => ({
      role: m.direction === "INBOUND" ? "user" : "assistant",
      content: m.body,
    }));

  const systemPrompt =
    conversation.agent?.systemPrompt ??
    "أنت مساعد خدمة عملاء محترف. ردّ بالعربية بشكل مختصر ومفيد.";
  // آخر رسالة واردة سؤالاً للاسترجاع + رقم العميل لاستعلامات DB
  const lastInbound =
    conversation.messages.find((m) => m.direction === "INBOUND")?.body ?? "";
  const knowledge = await collectAgentKnowledge(
    conversation.agent?.knowledgeSources ?? [],
    lastInbound,
    conversation.contact.waPhone
  );

  // إعدادات الذكاء الاصطناعي من إعدادات مساحة العمل مع .env كبديل
  const aiConfig = await resolveAiConfig(ctx.workspaceId);
  const aiReply = await generateReply(history, systemPrompt, knowledge, aiConfig);
  const suggestion = aiReply?.content ?? null;

  // بديل لطيف عند غياب المفتاح أو فشل الطلب — لا نرجع 500 أبداً هنا
  return NextResponse.json({
    suggestion: suggestion ?? "لا يمكن توليد اقتراح حالياً",
    fallback: suggestion === null,
  });
}
