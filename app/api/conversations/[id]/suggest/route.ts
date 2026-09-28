import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { generateReply, type ChatMessage } from "@/lib/openai";

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
  const knowledge =
    conversation.agent?.knowledgeSources.map((k) => k.content) ?? [];

  const suggestion = await generateReply(history, systemPrompt, knowledge);

  // بديل لطيف عند غياب المفتاح أو فشل الطلب — لا نرجع 500 أبداً هنا
  return NextResponse.json({
    suggestion: suggestion ?? "لا يمكن توليد اقتراح حالياً",
    fallback: suggestion === null,
  });
}
