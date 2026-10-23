import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import {
  resolveAiConfig,
  AI_PROVIDERS,
  type AiConfig,
  type AiErrorInfo,
} from "@/lib/openai";
import { generateWorkspaceReply } from "@/lib/billing/ai-usage";
import { workspaceIsReadOnly } from "@/lib/billing/workspace-access";

// رسالة دقيقة مبنية على رد المزود الفعلي — بدل افتراض «401 مفتاح خاطئ» دائماً
function describeAiError(info: AiErrorInfo, config: AiConfig): string {
  if (info.status === undefined) {
    return `تعذّر الاتصال بالمزود (${config.baseUrl}) — انقطاع شبكة أو منع من الوصول.`;
  }
  const snippet = info.body ? ` — ${info.body.slice(0, 160)}` : "";
  if (info.status === 401) {
    return "رفض المزود الطلب (401 مفتاح غير صحيح، أو انتهت صلاحيته/رصيده). تأكد أن المفتاح يخص نفس المزود المحدد في AI_PROVIDER، وراجع AI_PROVIDER/AI_BASE_URL في الإعدادات.";
  }
  if (info.status === 404) {
    return `النموذج «${config.model}» غير موجود لدى المزود (404). راجع AI_MODEL في الإعدادات.`;
  }
  if (info.status === 429) {
    return `تجاوزت حد الطلبات لدى المزود (429${snippet}).`;
  }
  return `فشل الطلب لدى المزود برمز الحالة ${info.status}${snippet}.`;
}

// اختبار مفتاح الذكاء الاصطناعي: القيم الممررة اختيارية —
// نختبر ما في حقول النموذج كما هي معروضة (حتى قبل الحفظ)، والمحفوظ (قاعدة البيانات أو .env) للفارغ منها
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (await workspaceIsReadOnly(ctx.workspaceId)) {
    return NextResponse.json({ ok: false, error: "انتهت التجربة المجانية؛ الترقية مطلوبة." }, { status: 402 });
  }

  let override: string | null = null;
  let draftProvider = "";
  let draftBaseUrl = "";
  let draftModel = "";
  try {
    const body = await req.json().catch(() => null);
    override = typeof body?.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : null;
    draftProvider = typeof body?.provider === "string" ? body.provider.trim() : "";
    draftBaseUrl = typeof body?.baseUrl === "string" ? body.baseUrl.trim() : "";
    draftModel = typeof body?.model === "string" ? body.model.trim() : "";
  } catch {
    // بلا جسم — نختبر المحفوظ
  }

  const config = await resolveAiConfig(ctx.workspaceId);
  // المزود المختار في القائمة (ولو لم يُحفظ بعد) يحدد الرابط والنموذج الافتراضيين
  const preset = AI_PROVIDERS[draftProvider as keyof typeof AI_PROVIDERS];
  const effectiveConfig: AiConfig = {
    ...config,
    apiKey: override ?? config.apiKey,
    baseUrl: draftBaseUrl || preset?.baseUrl || config.baseUrl,
    model: draftModel || preset?.model || config.model,
  };

  if (!effectiveConfig.apiKey) {
    return NextResponse.json({
      ok: false,
      error: "لا يوجد مفتاح OPENAI_API_KEY مضبوط (لا في الإعدادات ولا في .env)",
    });
  }

  const errorInfo: AiErrorInfo = {};
  const result = await generateWorkspaceReply(
    ctx.workspaceId,
    [{ role: "user", content: "قل: تم" }],
    "أنت مساعد تجريبي. رد بكلمة واحدة فقط.",
    [],
    effectiveConfig,
    300,
    errorInfo
  );
  if (result.trialExpired) {
    return NextResponse.json({ ok: false, error: "انتهت التجربة المجانية؛ الترقية مطلوبة." }, { status: 402 });
  }
  if (result.quotaExceeded) {
    return NextResponse.json({ ok: false, error: "تم بلوغ حد توكنات الذكاء الاصطناعي." }, { status: 402 });
  }
  const reply = result.reply;
  if (!reply) {
    return NextResponse.json({
      ok: false,
      error: describeAiError(errorInfo, effectiveConfig),
    });
  }
  return NextResponse.json({
    ok: true,
    message: reply.content,
    model: effectiveConfig.model,
  });
}
