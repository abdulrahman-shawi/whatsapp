import { getIntegration } from "@/lib/settings";

// توليد رد ذكي عبر أي واجهة متوافقة مع OpenAI — يعيد null عند أي فشل
// يدعم Tool Calling: تمرير أدوات اختيارية وقراءة طلبات استدعائها من المزود
export type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  // لرسائل tool: معرّف الاستدعاء واسم الأداة المنفَّذة
  toolCallId?: string;
  name?: string;
  // لرسائل assistant التي طلبت أدوات — تُمرَّر للمزود كـ tool_calls
  toolCalls?: ToolCall[];
};

// طلب استدعاء أداة كما يقرأ من استجابة المزود
export type ToolCall = {
  id: string;
  name: string;
  // حج arguments كسلسلة JSON خام — تُفك لاحقاً عند التنفيذ
  argumentsJson: string;
};

// تعريف أداة بصيغة OpenAI
export type AiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

// المزوّدون الجاهزون — كلهم يعرضون واجهة /chat/completions المتوافقة مع OpenAI
// "custom" يعتمد كلياً على AI_BASE_URL وAI_MODEL من الإعدادات
export const AI_PROVIDERS = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
  },
  kimi: { baseUrl: "https://api.moonshot.ai/v1", model: "kimi-k2-0711-preview" },
  openrouter: {
    baseUrl: "https://api.openrouter.ai/api/v1",
    model: "anthropic/claude-3.5-sonnet",
  },
  custom: { baseUrl: "", model: "" },
} as const;

export type AiConfig = {
  apiKey: string | null;
  baseUrl: string;
  model: string;
};

// حلّ إعدادات الذكاء الاصطناعي لمساحة العمل:
// المزوّد من AI_PROVIDER (افتراضي openai)، والرابط/النموذج من التجاوزات أو الجاهز
export async function resolveAiConfig(workspaceId: string): Promise<AiConfig> {
  const [apiKey, provider, baseUrl, model] = await Promise.all([
    getIntegration(workspaceId, "OPENAI_API_KEY"),
    getIntegration(workspaceId, "AI_PROVIDER"),
    getIntegration(workspaceId, "AI_BASE_URL"),
    getIntegration(workspaceId, "AI_MODEL"),
  ]);
  const preset =
    AI_PROVIDERS[(provider ?? "openai") as keyof typeof AI_PROVIDERS] ??
    AI_PROVIDERS.openai;
  return {
    apiKey,
    baseUrl: baseUrl || preset.baseUrl,
    model: model || preset.model,
  };
}

// نتيجة توليد الرد مع استهلاك التوكنات الفعلي كما يبلّغ عنه المزود
// toolCalls تُملأ عندما يطلب النموذج تنفيذ أدوات بدل الرد النهائي مباشرة
export type AiReply = {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: ToolCall[];
};

// تقدير تقريبي للتوكنات عندما لا يُبلّغ المزود عن الاستهلاك
// (قاعدة إبهام: توكن واحد ≈ ٤ أحرف إنجليزية؛ العربية أقل كثافة فنستخدم ٢.٥ حرف/توكن)
function estimateTokens(text: string): number {
  return Math.max(Math.ceil(text.length / 2.5), 1);
}

// تفاصيل فشل الطلب كما يردها المزود — تُملأ عند الحاجة للتشخيص
export type AiErrorInfo = { status?: number; body?: string };

// المفتاح والرابط والنموذج تُمرَّر من المتصل (من إعدادات مساحة العمل أو .env)
export async function generateReply(
  messages: ChatMessage[],
  systemPrompt: string,
  knowledge: string[],
  config: AiConfig,
  maxTokens = 300,
  errorInfo?: AiErrorInfo,
  options?: { tools?: AiTool[] }
): Promise<AiReply | null> {
  if (!config.apiKey || !config.baseUrl || !config.model) return null;

  // دمج مصادر المعرفة مع التعليمات الأساسية
  const system = [
    systemPrompt,
    knowledge.length > 0
      ? `معلومات يجب الاعتماد عليها في الرد:\n${knowledge.join("\n---\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const tools = options?.tools?.length ? options.tools : undefined;

  // عند تمرير أدوات نحتاج كائن أخطاء داخلي لنعرف إن كان الرفض بسببها (400)
  if (tools) {
    const err = errorInfo ?? {};
    const result = await requestCompletion(messages, system, config, maxTokens, err, tools);
    // تراجع آمن: إن رفض المزود الأدوات (400) نعيد المحاولة مرة واحدة بلا أدوات
    if (!result && err.status === 400) {
      console.warn("[ai] المزوّد لا يدعم الأدوات — إعادة المحاولة بلا tools");
      return requestCompletion(messages, system, config, maxTokens, errorInfo, undefined);
    }
    return result;
  }

  return requestCompletion(messages, system, config, maxTokens, errorInfo, undefined);
}

// تحويل رسائلنا الداخلية إلى الصيغة التي يتوقعها المزود
function serializeMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === "tool") {
    return {
      role: "tool",
      tool_call_id: m.toolCallId,
      name: m.name,
      content: m.content,
    };
  }
  if (m.role === "assistant" && m.toolCalls?.length) {
    return {
      role: "assistant",
      content: m.content,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.argumentsJson },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

async function requestCompletion(
  messages: ChatMessage[],
  system: string,
  config: AiConfig,
  maxTokens: number,
  errorInfo: AiErrorInfo | undefined,
  tools: AiTool[] | undefined
): Promise<AiReply | null> {
  try {
    const res = await fetch(
      `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "system", content: system }, ...messages.map(serializeMessage)],
          max_tokens: maxTokens,
          ...(tools ? { tools, tool_choice: "auto" } : {}),
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (errorInfo) {
        errorInfo.status = res.status;
        errorInfo.body = errText.slice(0, 300);
      }
      console.error(
        `[ai] فشل الطلب إلى ${config.baseUrl} (${res.status}): ${errText.slice(0, 500)}`
      );
      return null;
    }

    const data = await res.json();
    const message = data?.choices?.[0]?.message;
    const rawContent = message?.content;
    const content =
      typeof rawContent === "string" ? rawContent.trim() : rawContent == null ? "" : String(rawContent).trim();

    const toolCalls: ToolCall[] = Array.isArray(message?.tool_calls)
      ? message.tool_calls
          .filter(
            (c: unknown): c is { id: string; function: { name: string; arguments: string } } =>
              Boolean(c) &&
              typeof (c as { id?: unknown }).id === "string" &&
              typeof (c as { function?: { name?: unknown; arguments?: unknown } }).function
                ?.name === "string"
          )
          .map((c: { id: string; function: { name: string; arguments: string } }) => ({
            id: c.id,
            name: c.function.name,
            argumentsJson:
              typeof c.function.arguments === "string" ? c.function.arguments : "",
          }))
      : [];

    if (!content && toolCalls.length === 0) return null;

    // الاستهلاك الفعلي من حقل usage — عند غيابه نقدّره من الطول النصي
    const reported = data?.usage as
      | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
      | undefined;
    const promptEstimate =
      system.length + messages.reduce((sum, m) => sum + m.content.length, 0);
    const promptTokens = reported?.prompt_tokens ?? estimateTokens("x".repeat(promptEstimate));
    const completionTokens =
      reported?.completion_tokens ?? estimateTokens(content || toolCalls.map((c) => c.argumentsJson).join(" "));
    return {
      content,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: reported?.total_tokens ?? promptTokens + completionTokens,
      },
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (e) {
    if (errorInfo) errorInfo.body = e instanceof Error ? e.message : String(e);
    console.error("[ai] تعذّر الاتصال بالمزوّد:", e);
    return null;
  }
}
