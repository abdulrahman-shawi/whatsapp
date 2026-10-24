import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { resolveAiConfig, type ChatMessage } from "@/lib/openai";
import { generateWorkspaceReply } from "@/lib/billing/ai-usage";
import { workspaceIsReadOnly } from "@/lib/billing/workspace-access";

// تحسين نص تعليمات مهارة بالذكاء الاصطناعي — يستقبل النص الحالي ويعيد نسخة محسّنة
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
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const skillName =
    typeof body?.skillName === "string" && body.skillName.trim()
      ? body.skillName.trim()
      : "المهارة";
  if (!text || text.length < 10) {
    return NextResponse.json({ error: "النص قصير جداً للتحسين" }, { status: 400 });
  }

  const aiConfig = await resolveAiConfig(ctx.workspaceId);
  const result = await generateWorkspaceReply(
    ctx.workspaceId,
    [
      {
        role: "user",
        content: `حسّن التعليمات التالية لمهارة «${skillName}» في وكيل ذكاء اصطناعي لخدمة العملاء عبر واتساب. اجعلها أوضح وأدق وأسهل اتباعاً للنموذج، مع الإبقاء على نفس المعنى واللغة العربية، ولا تضف مقدمات — أعد النص المحسّن فقط:\n\n${text}`,
      },
    ] as ChatMessage[],
    "أنت محرر متخصص في كتابة تعليمات الوكلاء الذكيين لخدمة العملاء.",
    [],
    aiConfig,
    1024
  );
  if (result.quotaExceeded) {
    return NextResponse.json(
      { error: "تم بلوغ حد توكنات الذكاء الاصطناعي. رقِّ باقتك للمتابعة." },
      { status: 402 }
    );
  }
  const improved = result.reply?.content?.trim();
  if (!improved) {
    return NextResponse.json(
      { error: "تعذّر التحسين حالياً — تأكد من إعداد مفتاح الذكاء الاصطناعي" },
      { status: 502 }
    );
  }
  return NextResponse.json({ improved });
}
