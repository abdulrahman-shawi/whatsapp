import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { generateReply, resolveAiConfig, type ChatMessage } from "@/lib/openai";

// تجربة الوكيل دون حفظ: يستقبل حالة النموذج مباشرة ويعيد رداً تجريبياً
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.systemPrompt !== "string" ||
    !Array.isArray(body.messages)
  ) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const messages: ChatMessage[] = body.messages
    .filter(
      (m: unknown) =>
        m &&
        typeof (m as { content?: unknown }).content === "string" &&
        ["user", "assistant"].includes((m as { role?: string }).role ?? "")
    )
    .slice(-10);

  const knowledge = Array.isArray(body.knowledge)
    ? body.knowledge.filter((k: unknown) => typeof k === "string")
    : [];

  // لا يوجد وكيل محفوظ بعد — نستخدم إعدادات مساحة عمل المستخدم مباشرة
  const aiConfig = await resolveAiConfig(ctx.workspaceId);
  const aiReply = await generateReply(messages, body.systemPrompt, knowledge, aiConfig);
  const reply = aiReply?.content ?? null;

  // بديل لطيف عند غياب المفتاح أو فشل الطلب
  return NextResponse.json({
    reply:
      reply ??
      "لا يمكن توليد رد حالياً — تأكد من إعداد مفتاح الذكاء الاصطناعي في صفحة الإعدادات",
    fallback: reply === null,
  });
}
