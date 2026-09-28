import crypto from "crypto";
import { handleIncomingWhatsAppMessage } from "@/lib/agent-engine";
import { getIntegrationCandidates } from "@/lib/settings";

// أنواع مبسطة لبنية حمولة ميتا التي نحتاجها
interface MetaMessage {
  from: string;
  type: string;
  text?: { body?: string };
}
interface MetaValue {
  contacts?: { profile?: { name?: string } }[];
  messages?: MetaMessage[];
}

// التحقق من الويب هوك عند ربطه في لوحة ميتا
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // MVP أحادي المستأجر: نقبل التوكن من .env أو من إعدادات أي مساحة عمل
  const validTokens = await getIntegrationCandidates("WHATSAPP_VERIFY_TOKEN");
  if (mode === "subscribe" && token && validTokens.includes(token) && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

// التحقق من توقيع ميتا: sha256 + HMAC على الجسم الخام
// نجرّب كل الأسرار المرشحة (.env + إعدادات مساحات العمل)
async function verifySignature(
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  const secrets = await getIntegrationCandidates("META_APP_SECRET");
  if (secrets.length === 0) {
    // للتطوير فقط: بدون أي سر مضبوط نتخطى التحقق — فعّله في الإنتاج
    console.warn("[webhook] META_APP_SECRET غير مضبوط — تم تخطي التحقق من التوقيع");
    return true;
  }
  if (!signature?.startsWith("sha256=")) return false;

  const received = Buffer.from(signature);
  for (const secret of secrets) {
    const expected = Buffer.from(
      "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
    );
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) {
      return true;
    }
  }
  return false;
}

// نص بديل لأنواع الرسائل غير النصية
function placeholderFor(type: string): string {
  const map: Record<string, string> = {
    image: "[صورة]",
    video: "[مقطع فيديو]",
    audio: "[رسالة صوتية]",
    document: "[مستند]",
    sticker: "[ملصق]",
    location: "[موقع]",
  };
  return map[type] ?? `[${type}]`;
}

// استقبال الرسائل الواردة من ميتا
export async function POST(req: Request) {
  // يجب قراءة الجسم الخام قبل أي تحليل — التوقيع يُحسب عليه
  const rawBody = await req.text();
  if (!(await verifySignature(rawBody, req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: { entry?: { changes?: { value?: MetaValue }[] }[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // استخراج الرسائل من بنية entry/changes/value
  // ملاحظة: حقول statuses (تقارير التسليم) نتجاهلها حالياً لأننا لا نتتبع
  // معرّفات رسائلنا الصادرة بعد
  const tasks: Promise<unknown>[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      const profileName = value.contacts?.[0]?.profile?.name ?? null;
      for (const msg of value.messages) {
        const text =
          msg.type === "text" ? msg.text?.body ?? "" : placeholderFor(msg.type);
        if (!text) continue;
        tasks.push(
          handleIncomingWhatsAppMessage({
            waPhone: msg.from,
            contactName: profileName,
            text,
          })
        );
      }
    }
  }

  // نعالج بشكل غير متزامن ونرد 200 فوراً لميتا
  // في الإنتاج: استخدم طابور مهام (QStash/BullMQ) بدل fire-and-forget
  Promise.all(tasks).catch((e) =>
    console.error("[webhook] خطأ أثناء معالجة الرسائل:", e)
  );

  return new Response("OK", { status: 200 });
}
