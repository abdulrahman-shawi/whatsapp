import { handleIncomingWhatsAppMessage } from "@/lib/agent-engine";
import { resolveWorkspaceByUltraMsgInstance } from "@/lib/settings";
import { decodeDataUri, saveMediaAsset } from "@/lib/assets";
import { prisma } from "@/lib/prisma";

// ننتظر المعالجة كاملة (تأخير الرد + OpenAI) — نحتاج مهلة أطول من الافتراضية
export const maxDuration = 60;

// بنية حمولة UltraMsg المبسطة التي نحتاجها
interface UltraMsgData {
  from?: string; // بصيغة 9665xxxxxxxx@c.us
  fromMe?: boolean | string;
  type?: string;
  body?: string;
  media?: string; // رابط الوسائط في بعض إعدادات الويب هوك
  caption?: string; // التسمية التوضيحية للوسائط إن وُجدت
  pushname?: string;
  name?: string;
}

// نص بديل لأنواع الرسائل غير النصية
function placeholderFor(type: string): string {
  const map: Record<string, string> = {
    image: "[صورة]",
    video: "[مقطع فيديو]",
    audio: "[رسالة صوتية]",
    ptt: "[رسالة صوتية]",
    document: "[مستند]",
    sticker: "[ملصق]",
    location: "[موقع]",
  };
  return map[type] ?? `[${type}]`;
}

// أنواع وسائط UltraMsg القابلة للعرض — تصل كرابط مباشر في body
const ULTRAMSG_MEDIA_TYPES: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  ptt: "audio", // الرسالة الصوتية المسجلة داخل واتساب
  document: "document",
};

// استقبال الرسائل الواردة من UltraMsg
// يُضبط رابط هذا الويب هوك في إعدادات النسخة (instance) في لوحة UltraMsg
// مع إلحاق ?instanceId= بعنوانه لتحديد مساحة العمل المالكة (multi-tenant)
export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as {
    event_type?: string;
    data?: UltraMsgData;
  } | null;
  if (!payload) return new Response("Bad JSON", { status: 400 });

  // نهتم بالرسائل الواردة فقط — نتجاهل بقية الأحداث (ack، حالات الاتصال...)
  if (payload.event_type !== "message_received") {
    return new Response("OK", { status: 200 });
  }

  const data = payload.data ?? {};
  // رسائلي الصادرة تصل أيضاً للويب هوك — نتجاهلها حتى لا تتكرر في المحادثة
  const fromMe = data.fromMe === true || data.fromMe === "true";
  const waPhone = data.from?.replace("@c.us", "") ?? "";
  if (fromMe || !waPhone) {
    return new Response("OK", { status: 200 });
  }

  // توجيه الرسالة لمساحة العمل المالكة للنسخة — الاحتياط: السلوك القديم
  const instanceId = new URL(req.url).searchParams.get("instanceId");
  const workspaceId = instanceId
    ? await resolveWorkspaceByUltraMsgInstance(instanceId)
    : null;
  if (instanceId && !workspaceId) {
    console.warn(`[ultramsg-webhook] لم تُعثر على مساحة عمل للنسخة ${instanceId}`);
  }

  const mediaType = data.type ? ULTRAMSG_MEDIA_TYPES[data.type] : undefined;
  // في UltraMsg تصل الوسائط إما كرابط مباشر في body أو base64
  // (حسب إعداد "Webhook data type" في لوحة النسخة) — ندعم الحالتين
  let mediaUrl: string | undefined;
  let mediaAssetId: string | undefined;
  let mediaMime: string | null = null;
  // رابط الوسائط قد يصل في حقل media أو في body مباشرة
  const bodyOrMedia = data.body ?? data.media ?? "";
  if (mediaType && bodyOrMedia) {
    if (bodyOrMedia.startsWith("http")) {
      mediaUrl = bodyOrMedia;
    } else {
      // body قد يكون data URI أو base64 خاماً
      const decoded =
        decodeDataUri(bodyOrMedia) ??
        (() => {
          try {
            return { buffer: Buffer.from(bodyOrMedia, "base64"), mime: "application/octet-stream" };
          } catch {
            return null;
          }
        })();
      // نتجاهل base64 غير صالح أو الملفات الضخمة — قيود حجم طلب/قاعدة البيانات
      if (decoded && decoded.buffer.length > 0 && decoded.buffer.length <= 4 * 1024 * 1024) {
        const workspaceForAsset =
          workspaceId ??
          (await prisma.workspace.findFirst({ select: { id: true } }))?.id;
        if (workspaceForAsset) {
          const asset = await saveMediaAsset({
            workspaceId: workspaceForAsset,
            buffer: decoded.buffer,
            mime: decoded.mime,
            filename: `وارد-${mediaType}`,
          });
          mediaAssetId = asset.id;
          mediaMime = decoded.mime;
        }
      } else if (decoded && decoded.buffer.length > 4 * 1024 * 1024) {
        console.warn("[ultramsg-webhook] وسائط واردة تتجاوز 4MB — لم تُخزَّن للعرض");
      }
    }
  }

  const text =
    data.type === "chat" || !data.type
      ? data.body ?? ""
      : data.caption?.trim()
        ? data.caption.trim()
        : placeholderFor(data.type);

  if (text || mediaUrl) {
    // ننتظر اكتمال المعالجة قبل الرد — على Vercel تُجمَّد الدالة بعد إرسال
    // الرد، فالمعالجة غير المتزامنة (fire-and-forget) قد لا تكتمل أبداً
    try {
      await handleIncomingWhatsAppMessage({
        waPhone,
        contactName: data.pushname ?? data.name ?? null,
        text,
        workspaceId: workspaceId ?? undefined,
        media: mediaUrl
          ? { mediaId: mediaUrl, mediaMime: null, mediaType: mediaType ?? null }
          : mediaAssetId
            ? { mediaId: `asset:${mediaAssetId}`, mediaMime, mediaType: mediaType ?? null }
            : undefined,
      });
    } catch (e) {
      console.error("[ultramsg-webhook] خطأ أثناء المعالجة:", e);
    }
  }

  return new Response("OK", { status: 200 });
}
