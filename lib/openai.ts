// توليد رد ذكي عبر OpenAI — يعيد null عند غياب المفتاح أو أي فشل
export type ChatMessage = { role: "user" | "assistant"; content: string };

// المفتاح يُمرَّر من المتصل (يُجلب من إعدادات مساحة العمل أو .env)
export async function generateReply(
  messages: ChatMessage[],
  systemPrompt: string,
  knowledge: string[],
  apiKey: string | null
): Promise<string | null> {
  if (!apiKey) return null;

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
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: system }, ...messages],
        max_tokens: 300,
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch {
    return null;
  }
}
