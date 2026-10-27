import {
  getIntegrationCandidates,
  resolveWorkspaceByPhoneNumberId,
} from "@/lib/settings";
import { enqueueWebhookEvent } from "@/lib/webhook-queue";
import { verifyMetaSignature } from "@/lib/meta-webhook";

export const maxDuration = 60;

interface MetaMedia {
  id?: string;
  mime_type?: string;
  caption?: string;
}
interface MetaMessage {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  image?: MetaMedia;
  document?: MetaMedia;
  audio?: MetaMedia;
  video?: MetaMedia;
  referral?: {
    source_type?: string;
    source_url?: string;
    source_id?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
  };
}
interface MetaStatus {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}
interface MetaValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string } }[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const validTokens = await getIntegrationCandidates("WHATSAPP_VERIFY_TOKEN");
  if (mode === "subscribe" && token && validTokens.includes(token) && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

const MEDIA_TYPES = ["image", "document", "audio", "video"] as const;

function placeholderFor(type: string): string {
  const map: Record<string, string> = {
    sticker: "[ملصق]",
    location: "[موقع]",
  };
  return map[type] ?? `[${type}]`;
}

/** يخزّن الأحداث أولاً؛ المعالجة والرد الذكي يتمان داخل عامل الطابور. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const secrets = await getIntegrationCandidates("META_APP_SECRET");
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), secrets)) {
    if (secrets.length === 0) {
      console.error("[webhook] رُفض الطلب: META_APP_SECRET غير مضبوط");
    }
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: { entry?: { changes?: { value?: MetaValue }[] }[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages && !value?.statuses) continue;
        const phoneNumberId = value.metadata?.phone_number_id ?? null;
        const workspaceId = phoneNumberId
          ? await resolveWorkspaceByPhoneNumberId(phoneNumberId)
          : null;
        const profileName = value.contacts?.[0]?.profile?.name ?? null;

        for (const msg of value.messages ?? []) {
          if (!msg.id || !msg.from) continue;
          const mediaType = MEDIA_TYPES.find((t) => msg[t]?.id);
          const media = mediaType ? msg[mediaType] : undefined;
          const text = media
            ? (media.caption ?? `[${mediaType === "image" ? "صورة" : mediaType === "document" ? "مستند" : mediaType === "audio" ? "رسالة صوتية" : "مقطع فيديو"}]`)
            : msg.type === "text"
              ? msg.text?.body ?? ""
              : placeholderFor(msg.type);
          if (!text && !mediaType) continue;

          await enqueueWebhookEvent({
            provider: "META",
            externalId: `message:${msg.id}`,
            workspaceId,
            payload: {
              kind: "message",
              phoneNumberId,
              input: {
                waPhone: msg.from,
                waMessageId: msg.id,
                contactName: profileName,
                text,
                ...(media?.id
                  ? {
                      media: {
                        mediaId: media.id,
                        mediaMime: media.mime_type ?? null,
                        mediaType: mediaType ?? null,
                      },
                    }
                  : {}),
                ...(msg.referral
                  ? {
                      referral: {
                        sourceType: msg.referral.source_type,
                        sourceUrl: msg.referral.source_url,
                        sourceId: msg.referral.source_id,
                        headline: msg.referral.headline,
                        body: msg.referral.body,
                        clickId: msg.referral.ctwa_clid,
                      },
                    }
                  : {}),
              },
            },
          });
        }

        for (const status of value.statuses ?? []) {
          if (!status.id || !status.status) continue;
          await enqueueWebhookEvent({
            provider: "META",
            externalId: `status:${status.id}:${status.status}`,
            workspaceId,
            payload: {
              kind: "status",
              phoneNumberId,
              status: {
                id: status.id,
                status: status.status,
                timestamp: status.timestamp ?? null,
                recipientId: status.recipient_id ?? null,
                errors: status.errors ?? [],
              },
            },
          });
        }
      }
    }
  } catch (error) {
    console.error("[webhook] تعذر حفظ الحدث في الطابور:", error);
    return new Response("Queue unavailable", { status: 503 });
  }

  return new Response("OK", { status: 200 });
}
