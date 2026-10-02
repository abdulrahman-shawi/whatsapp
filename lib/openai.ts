import { getIntegration } from "@/lib/settings";

// توليد رد ذكي عبر أي واجهة متوافقة مع OpenAI — يعيد null عند أي فشل
export type ChatMessage = { role: "user" | "assistant"; content: string };

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
    baseUrl: "https://openrouter.ai/api/v1",
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

// المفتاح والرابط والنموذج تُمرَّر من المتصل (من إعدادات مساحة العمل أو .env)
export async function generateReply(
  messages: ChatMessage[],
  systemPrompt: string,
  knowledge: string[],
  config: AiConfig
): Promise<string | null> {
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
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: 300,
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[ai] فشل الطلب إلى ${config.baseUrl} (${res.status}): ${errText.slice(0, 500)}`
      );
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch (e) {
    console.error("[ai] تعذّر الاتصال بالمزوّد:", e);
    return null;
  }
}
