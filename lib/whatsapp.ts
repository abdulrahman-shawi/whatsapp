import { getIntegration } from "@/lib/settings";
import { metaGraphUrl } from "@/lib/meta-graph";

export type WhatsAppCreds =
  | { provider: "meta"; token: string; phoneNumberId: string }
  | { provider: "ultramsg"; instanceId: string; token: string };

export type WhatsAppResult = {
  ok: boolean;
  messageId: string | null;
  error: string | null;
};

export type WhatsAppUploadResult = {
  mediaId: string | null;
  error: string | null;
};

function success(messageId: string | null = null): WhatsAppResult {
  return { ok: true, messageId, error: null };
}
function failure(error: string): WhatsAppResult {
  return { ok: false, messageId: null, error };
}
function exceptionDetail(provider: string, error: unknown): string {
  return `${provider} — استثناء: ${error instanceof Error ? error.message.slice(0, 200) : "شبكة"}`;
}

async function failDetail(provider: string, res: Response): Promise<string> {
  const body = (await res.text().catch(() => "")).slice(0, 300);
  return `${provider} — الحالة ${res.status}: ${body}`;
}

export async function resolveWhatsAppCreds(
  workspaceId: string
): Promise<WhatsAppCreds | null> {
  const [token, phoneNumberId, instanceId, ultramsgToken] = await Promise.all([
    getIntegration(workspaceId, "WHATSAPP_TOKEN"),
    getIntegration(workspaceId, "WHATSAPP_PHONE_NUMBER_ID"),
    getIntegration(workspaceId, "ULTRAMSG_INSTANCE_ID"),
    getIntegration(workspaceId, "ULTRAMSG_TOKEN"),
  ]);
  if (token && phoneNumberId) {
    return { provider: "meta", token, phoneNumberId };
  }
  if (instanceId && ultramsgToken) {
    return { provider: "ultramsg", instanceId, token: ultramsgToken };
  }
  return null;
}

async function sendMetaPayload(
  phoneNumberId: string,
  token: string,
  payload: Record<string, unknown>,
  label = "ميتا"
): Promise<WhatsAppResult> {
  try {
    const res = await fetch(metaGraphUrl(`${phoneNumberId}/messages`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return failure(await failDetail(label, res));
    const data = (await res.json().catch(() => null)) as {
      messages?: { id?: string }[];
    } | null;
    return success(data?.messages?.[0]?.id ?? null);
  } catch (error) {
    return failure(exceptionDetail(label, error));
  }
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  creds: WhatsAppCreds | null
): Promise<WhatsAppResult> {
  if (!creds) return failure("لا يوجد مزود واتساب مُعدّ");
  if (creds.provider === "meta") {
    return sendMetaPayload(creds.phoneNumberId, creds.token, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    });
  }

  try {
    const res = await fetch(
      `https://api.ultramsg.com/${creds.instanceId}/messages/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: creds.token, to, body }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) return failure(await failDetail("UltraMsg", res));
    const data = (await res.json().catch(() => null)) as {
      sent?: string | boolean;
      id?: string | number;
    } | null;
    if (!(data?.sent === true || data?.sent === "true")) {
      return failure(`UltraMsg — الرد: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return success(data.id ? String(data.id) : null);
  } catch (error) {
    return failure(exceptionDetail("UltraMsg", error));
  }
}

export function mediaTypeForMime(mime: string): "image" | "document" | "audio" | "video" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export async function uploadWhatsAppMedia(
  file: { buffer: Buffer; mime: string; filename: string },
  creds: WhatsAppCreds | null
): Promise<WhatsAppUploadResult> {
  if (!creds || creds.provider !== "meta") {
    return { mediaId: null, error: "رفع الوسائط يتطلب مزود Meta" };
  }
  try {
    const form = new FormData();
    const bytes = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength
    ) as ArrayBuffer;
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([bytes], { type: file.mime }), file.filename);
    const res = await fetch(metaGraphUrl(`${creds.phoneNumberId}/media`), {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.token}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return { mediaId: null, error: await failDetail("ميتا (رفع وسائط)", res) };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return data?.id
      ? { mediaId: data.id, error: null }
      : { mediaId: null, error: "لم يعد Meta معرف الوسائط" };
  } catch (error) {
    return { mediaId: null, error: exceptionDetail("ميتا (رفع وسائط)", error) };
  }
}

type MediaInput = {
  mediaId: string;
  mediaType: "image" | "document" | "audio" | "video";
  mime: string;
  filename?: string;
  caption?: string;
  voice?: boolean;
  buffer?: Buffer;
};

export async function sendWhatsAppMedia(
  to: string,
  media: MediaInput,
  creds: WhatsAppCreds | null
): Promise<WhatsAppResult> {
  if (!creds) return failure("لا يوجد مزود واتساب مُعدّ");
  if (creds.provider === "meta") {
    const payload: Record<string, unknown> = media.mediaType === "document"
      ? {
          messaging_product: "whatsapp",
          to,
          type: "document",
          document: {
            id: media.mediaId,
            caption: media.caption,
            filename: media.filename ?? "ملف",
          },
        }
      : media.mediaType === "audio"
        ? {
            messaging_product: "whatsapp",
            to,
            type: "audio",
            audio: { id: media.mediaId, ...(media.voice ? { voice: true } : {}) },
          }
        : {
            messaging_product: "whatsapp",
            to,
            type: media.mediaType,
            [media.mediaType]: { id: media.mediaId, caption: media.caption },
          };
    return sendMetaPayload(creds.phoneNumberId, creds.token, payload, "ميتا (وسائط)");
  }

  if (!media.buffer) return failure("ملف UltraMsg غير متاح");
  try {
    const dataUri = `data:${media.mime};base64,${media.buffer.toString("base64")}`;
    const params = new URLSearchParams({
      token: creds.token,
      to,
      body: dataUri,
    });
    if (media.caption) params.set("caption", media.caption);
    if (media.mediaType === "document") {
      params.set("filename", media.filename ?? "ملف");
    }
    const res = await fetch(
      `https://api.ultramsg.com/${creds.instanceId}/messages/${media.mediaType}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!res.ok) return failure(await failDetail("UltraMsg", res));
    const data = (await res.json().catch(() => null)) as {
      sent?: string | boolean;
      id?: string | number;
    } | null;
    if (!(data?.sent === true || data?.sent === "true")) {
      return failure(`UltraMsg — الرد: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return success(data.id ? String(data.id) : null);
  } catch (error) {
    return failure(exceptionDetail("UltraMsg", error));
  }
}

export async function sendWhatsAppLocationRequest(
  to: string,
  prompt: string,
  creds: WhatsAppCreds | null
): Promise<WhatsAppResult> {
  if (!creds || creds.provider !== "meta") {
    return failure("طلب الموقع يتطلب مزود Meta");
  }
  return sendMetaPayload(creds.phoneNumberId, creds.token, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: prompt },
      action: { name: "send_location" },
    },
  }, "ميتا (طلب موقع)");
}

export async function sendWhatsAppTemplate(
  to: string,
  template: { name: string; language: string; params: string[] },
  creds: WhatsAppCreds | null
): Promise<WhatsAppResult> {
  if (!creds || creds.provider !== "meta") {
    return failure("قوالب واتساب تتطلب مزود Meta");
  }
  const templatePayload: Record<string, unknown> = {
    name: template.name,
    language: { code: template.language },
  };
  if (template.params.length > 0) {
    templatePayload.components = [{
      type: "body",
      parameters: template.params.map((text) => ({ type: "text", text })),
    }];
  }
  return sendMetaPayload(creds.phoneNumberId, creds.token, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: templatePayload,
  }, "ميتا (قالب)");
}
