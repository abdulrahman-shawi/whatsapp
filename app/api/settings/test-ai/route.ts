import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { generateReply, resolveAiConfig } from "@/lib/openai";

// اختبار مفتاح الذكاء الاصطناعي: القيمة الممررة اختيارية —
// إن أُعطيت نختبرها مباشرة، وإلا نختبر المحفوظ (قاعدة البيانات أو .env)
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  let override: string | null = null;
  try {
    const body = await req.json().catch(() => null);
    override = typeof body?.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : null;
  } catch {
    // بلا جسم — نختبر المحفوظ
  }

  const config = await resolveAiConfig(ctx.workspaceId);
  const apiKey = override ?? config.apiKey;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "لا يوجد مفتاح OPENAI_API_KEY مضبوط (لا في الإعدادات ولا في .env)",
    });
  }

  const reply = await generateReply(
    [{ role: "user", content: "قل: تم" }],
    "أنت مساعد تجريبي. رد بكلمة واحدة فقط.",
    [],
    { ...config, apiKey }
  );
  if (!reply) {
    return NextResponse.json({
      ok: false,
      error:
        "رفض المزود الطلب (401 مفتاح غير صحيح، أو انتهت الرصيد/الصلاحية، أو انقطاع شبكة). راجع المفتاح أو AI_PROVIDER/AI_BASE_URL في الإعدادات.",
    });
  }
  return NextResponse.json({
    ok: true,
    message: reply.content,
    model: config.model,
  });
}
