import type { AiConfig } from "@/lib/openai";

export async function synthesizeVoiceReply(
  text: string,
  config: AiConfig
): Promise<Buffer | null> {
  if (!config.apiKey || config.baseUrl.replace(/\/+$/, "") !== "https://api.openai.com/v1") {
    console.warn(
      "[tts] الرد الصوتي يتطلب مفتاح OpenAI ورابط API الرسمي؛ سيُرسل الرد كنص"
    );
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text.slice(0, 4000),
        response_format: "opus",
      }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 400);
      console.error(`[tts] فشل توليد الصوت (${response.status}): ${detail}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("[tts] تعذّر الاتصال بخدمة توليد الصوت:", error);
    return null;
  }
}
