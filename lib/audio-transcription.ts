import { metaGraphUrl } from "@/lib/meta-graph";
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;

export type AudioTranscriptionConfig = {
  apiKey: string;
  provider: "openai" | "gemini";
  model: string;
};

function audioExtension(mime: string): string {
  const type = mime.split(";")[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "audio/aac": "aac",
    "audio/amr": "amr",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-wav": "wav",
    "audio/3gpp": "3gp",
  };
  const extension = extensions[type];
  if (!extension) throw new Error(`صيغة الصوت غير مدعومة: ${type || "غير معروفة"}`);
  return extension;
}

export async function downloadMetaAudio(
  mediaId: string,
  token: string
): Promise<{ buffer: Buffer; mime: string }> {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(mediaId)) {
    throw new Error("معرّف الوسيط الصوتي غير صالح");
  }

  const metadataResponse = await fetch(
    metaGraphUrl(encodeURIComponent(mediaId)),
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );
  if (!metadataResponse.ok) {
    throw new Error(`تعذّر جلب بيانات الوسيط من Meta (${metadataResponse.status})`);
  }

  const metadata = (await metadataResponse.json()) as {
    url?: string;
    mime_type?: string;
  };
  if (!metadata.url) throw new Error("لم تُرجع Meta رابط الوسيط الصوتي");

  const mediaUrl = new URL(metadata.url);
  if (
    mediaUrl.protocol !== "https:" ||
    !["lookaside.fbsbx.com", "graph.facebook.com"].includes(mediaUrl.hostname)
  ) {
    throw new Error("رابط الوسيط الصوتي من Meta غير موثوق");
  }

  const mediaResponse = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!mediaResponse.ok) {
    throw new Error(`تعذّر تنزيل الوسيط الصوتي من Meta (${mediaResponse.status})`);
  }

  const mime = metadata.mime_type ?? mediaResponse.headers.get("content-type") ?? "";
  if (!mime.toLowerCase().startsWith("audio/")) {
    throw new Error("نوع الوسيط الذي أرسلته Meta ليس ملفاً صوتياً");
  }
  audioExtension(mime);

  const declaredLength = Number(mediaResponse.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_SIZE) {
    throw new Error("حجم الرسالة الصوتية يتجاوز الحد المدعوم (25MB)");
  }
  if (!mediaResponse.body) throw new Error("استجابة تنزيل الصوت فارغة");

  const reader = mediaResponse.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_AUDIO_SIZE) {
      await reader.cancel();
      throw new Error("حجم الرسالة الصوتية يتجاوز الحد المدعوم (25MB)");
    }
    chunks.push(value);
  }

  if (size === 0) throw new Error("ملف الرسالة الصوتية فارغ");
  return { buffer: Buffer.concat(chunks), mime };
}

export async function transcribeAudio(
  buffer: Buffer,
  mime: string,
  config: AudioTranscriptionConfig
): Promise<string> {
  const extension = audioExtension(mime);

  if (config.provider === "gemini") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "فرّغ الكلام المنطوق في هذا التسجيل حرفياً إلى نص باللغة العربية. أعد النص المسموع فقط، ولا تضف وصفاً أو تخميناً.",
                },
                {
                  inlineData: {
                    mimeType: mime.split(";")[0].trim(),
                    data: buffer.toString("base64"),
                  },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`فشل تفريغ الصوت عبر Gemini (${response.status}): ${detail}`);
    }

    const result = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const transcript = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!transcript) throw new Error("لم يُرجع Gemini نصاً للتسجيل الصوتي");
    return transcript;
  }

  const form = new FormData();
  const bytes = new Uint8Array(buffer);
  form.append("file", new Blob([bytes], { type: mime }), `voice.${extension}`);
  form.append("model", config.model);
  form.append("language", "ar");
  form.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`فشل تفريغ الصوت عبر Whisper (${response.status}): ${detail}`);
  }

  const result = (await response.json()) as { text?: string };
  if (!result.text?.trim()) throw new Error("لم يُرجع Whisper نصاً للتسجيل الصوتي");
  return result.text.trim();
}
