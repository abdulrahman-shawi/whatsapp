import { getIntegration } from "@/lib/settings";

// بيانات اعتماد الإرسال: ميتا أولاً، وإن كانت حقوله فارغة نستخدم UltraMsg
export type WhatsAppCreds =
  | { provider: "meta"; token: string; phoneNumberId: string }
  | { provider: "ultramsg"; instanceId: string; token: string };

// آخر خطأ مفصّل من مزود واتساب (جسم الرد الفعلي) — لتشخيص أعطال الإرسال
let lastError: string | null = null;
export function getLastWhatsAppError(): string | null {
  return lastError;
}

// بناء وصف خطأ من استجابة المزود: الحالة + أول 300 حرف من الجسم
async function failDetail(provider: string, res: Response): Promise<string> {
  const body = (await res.text().catch(() => "")).slice(0, 300);
  return `${provider} — الحالة ${res.status}: ${body}`;
}

// حلّ مزوّد واتساب لمساحة العمل: Meta إن اكتملت حقوله، وإلا UltraMsg
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

// إرسال رسالة واتساب عبر المزوّد المختار — يعيد false عند أي فشل دون رمي أخطاء
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  creds: WhatsAppCreds | null
): Promise<boolean> {
  lastError = null;
  if (!creds) return false;
  return creds.provider === "meta"
    ? sendViaMeta(to, body, creds)
    : sendViaUltraMsg(to, body, creds);
}

async function sendViaMeta(
  to: string,
  body: string,
  creds: { token: string; phoneNumberId: string }
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body },
        }),
      }
    );
    if (!res.ok) lastError = await failDetail("ميتا", res);
    return res.ok;
  } catch (e) {
    lastError = `ميتا — استثناء: ${e instanceof Error ? e.message.slice(0, 200) : "شبكة"}`;
    return false;
  }
}

async function sendViaUltraMsg(
  to: string,
  body: string,
  creds: { instanceId: string; token: string }
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.ultramsg.com/${creds.instanceId}/messages/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: creds.token,
          to,
          body,
        }),
      }
    );
    if (!res.ok) {
      lastError = await failDetail("UltraMsg", res);
      return false;
    }
    const data = (await res.json().catch(() => null)) as {
      sent?: string | boolean;
    } | null;
    if (!(data?.sent === true || data?.sent === "true")) {
      lastError = `UltraMsg — الرد: ${JSON.stringify(data).slice(0, 300)}`;
      return false;
    }
    return true;
  } catch (e) {
    lastError = `UltraMsg — استثناء: ${e instanceof Error ? e.message.slice(0, 200) : "شبكة"}`;
    return false;
  }
}

// تحديد نوع رسالة الوسائط في ميتا من نوع الملف (mime)
export function mediaTypeForMime(mime: string): "image" | "document" | "audio" | "video" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

// رفع وسائط إلى خوادم ميتا وإعادة معرّفها — مطلوب قبل إرسالها (مزود ميتا فقط)
export async function uploadWhatsAppMedia(
  file: { buffer: Buffer; mime: string; filename: string },
  creds: WhatsAppCreds | null
): Promise<string | null> {
  lastError = null;
  if (!creds || creds.provider !== "meta") return null;
  try {
    const form = new FormData();
    // Buffer قد يكون منظراً (byteOffset) على مخزن أكبر — نأخذ البايتات فقط
    const bytes = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength
    ) as ArrayBuffer;
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([bytes], { type: file.mime }), file.filename);
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${creds.phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.token}` },
        body: form,
      }
    );
    if (!res.ok) {
      lastError = await failDetail("ميتا (رفع وسائط)", res);
      return null;
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return data?.id ?? null;
  } catch (e) {
    lastError = `ميتا (رفع وسائط) — استثناء: ${e instanceof Error ? e.message.slice(0, 200) : "شبكة"}`;
    return null;
  }
}

// إرسال رسالة وسائط (image/document/audio/video) — عبر ميتا أو UltraMsg
export async function sendWhatsAppMedia(
  to: string,
  media: {
    mediaId: string;
    mediaType: "image" | "document" | "audio" | "video";
    mime: string;
    filename?: string;
    caption?: string;
    // ملف UltraMsg الخام (base64) — لا يحتاج mediaId مرفوعاً مسبقاً
    buffer?: Buffer;
  },
  creds: WhatsAppCreds | null
): Promise<boolean> {
  lastError = null;
  if (!creds) return false;
  return creds.provider === "meta"
    ? sendMediaViaMeta(to, media, creds)
    : sendMediaViaUltraMsg(to, media, creds);
}

async function sendMediaViaMeta(
  to: string,
  media: {
    mediaId: string;
    mediaType: "image" | "document" | "audio" | "video";
    mime: string;
    filename?: string;
    caption?: string;
  },
  creds: { token: string; phoneNumberId: string }
): Promise<boolean> {
  try {
    // مستند بلا تسمية توضيحية يحتاج اسماً للعرض في واتساب
    const payload =
      media.mediaType === "document"
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
        : {
            messaging_product: "whatsapp",
            to,
            type: media.mediaType,
            [media.mediaType]: { id: media.mediaId, caption: media.caption },
          };
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) lastError = await failDetail("ميتا (وسائط)", res);
    return res.ok;
  } catch (e) {
    lastError = `ميتا (وسائط) — استثناء: ${e instanceof Error ? e.message.slice(0, 200) : "شبكة"}`;
    return false;
  }
}

// UltraMsg يقبل الوسائط كرابط أو base64 — نرسل الملف مباشرة دون رفع مسبق
async function sendMediaViaUltraMsg(
  to: string,
  media: {
    mediaType: "image" | "document" | "audio" | "video";
    mime: string;
    filename?: string;
    caption?: string;
    buffer?: Buffer;
  },
  creds: { instanceId: string; token: string }
): Promise<boolean> {
  if (!media.buffer) return false;
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
      }
    );
    if (!res.ok) {
      lastError = await failDetail("UltraMsg", res);
      return false;
    }
    const data = (await res.json().catch(() => null)) as {
      sent?: string | boolean;
    } | null;
    if (!(data?.sent === true || data?.sent === "true")) {
      lastError = `UltraMsg — الرد: ${JSON.stringify(data).slice(0, 300)}`;
      return false;
    }
    return true;
  } catch (e) {
    lastError = `UltraMsg — استثناء: ${e instanceof Error ? e.message.slice(0, 200) : "شبكة"}`;
    return false;
  }
}

// طلب مشاركة الموقع من العميل — رسالة تفاعلية (مزود ميتا فقط)
export async function sendWhatsAppLocationRequest(
  to: string,
  prompt: string,
  creds: WhatsAppCreds | null
): Promise<boolean> {
  if (!creds || creds.provider !== "meta") return false;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "location_request_message",
            body: { text: prompt },
            action: { name: "send_location" },
          },
        }),
      }
    );
    if (!res.ok) lastError = await failDetail("ميتا (طلب موقع)", res);
    return res.ok;
  } catch (e) {
    lastError = `ميتا (طلب موقع) — استثناء: ${e instanceof Error ? e.message.slice(0, 200) : "شبكة"}`;
    return false;
  }
}

// إرسال قالب معتمد — للمراسلة خارج نافذة ٢٤ ساعة (مزود ميتا فقط)
export async function sendWhatsAppTemplate(
  to: string,
  template: { name: string; language: string; params: string[] },
  creds: WhatsAppCreds | null
): Promise<boolean> {
  lastError = null;
  if (!creds || creds.provider !== "meta") return false;
  try {
    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
      },
    };
    // القوالب ذات المتغيرات ترسل قيمها في المكوّن الأول من نوع body
    if (template.params.length > 0) {
      (body.template as Record<string, unknown>).components = [
        {
          type: "body",
          parameters: template.params.map((p) => ({
            type: "text",
            text: p,
          })),
        },
      ];
    }
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) lastError = await failDetail("ميتا (قالب)", res);
    return res.ok;
  } catch (e) {
    lastError = `ميتا (قالب) — استثناء: ${e instanceof Error ? e.message.slice(0, 200) : "شبكة"}`;
    return false;
  }
}
