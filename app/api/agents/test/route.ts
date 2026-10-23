import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { resolveAiConfig, type ChatMessage } from "@/lib/openai";
import { generateWorkspaceReply } from "@/lib/billing/ai-usage";
import { workspaceIsReadOnly } from "@/lib/billing/workspace-access";

// تجربة الوكيل دون حفظ: يستقبل حالة النموذج مباشرة ويعيد رداً تجريبياً
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (await workspaceIsReadOnly(ctx.workspaceId)) {
    return NextResponse.json(
      { error: "انتهت التجربة المجانية؛ الترقية مطلوبة لاستخدام الذكاء الاصطناعي." },
      { status: 402 }
    );
  }

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
  const result = await generateWorkspaceReply(
    ctx.workspaceId,
    messages,
    body.systemPrompt,
    knowledge,
    aiConfig
  );
  if (result.quotaExceeded) {
    return NextResponse.json(
      { error: "تم بلوغ حد توكنات الذكاء الاصطناعي. رقِّ باقتك للمتابعة." },
      { status: 402 }
    );
  }
  const aiReply = result.reply;
  const reply = aiReply?.content ?? null;

  // بديل لطيف عند غياب المفتاح أو فشل الطلب
  return NextResponse.json({
    reply:
      reply ??
      "لا يمكن توليد رد حالياً — تأكد من إعداد مفتاح الذكاء الاصطناعي في صفحة الإعدادات",
    fallback: reply === null,
  });
}
