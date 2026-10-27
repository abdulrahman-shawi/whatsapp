import type { WebhookEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleIncomingWhatsAppMessage } from "@/lib/agent-engine";
import {
  resolveWorkspaceByPhoneNumberId,
  resolveWorkspaceByUltraMsgInstance,
} from "@/lib/settings";
import { decodeDataUri, saveMediaAsset } from "@/lib/assets";
import {
  applyMetaDeliveryStatus,
  metaStatusDate,
  parseMetaDeliveryStatus,
} from "@/lib/message-delivery";

const ULTRAMSG_MEDIA_TYPES: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  ptt: "audio",
  document: "document",
};

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

type MetaEventPayload =
  | {
      kind: "message";
      phoneNumberId: string | null;
      input: {
        waPhone: string;
        waMessageId: string;
        contactName: string | null;
        text: string;
        media?: { mediaId: string; mediaMime: string | null; mediaType: string | null };
        referral?: Parameters<typeof handleIncomingWhatsAppMessage>[0]["referral"];
      };
    }
  | {
      kind: "status";
      phoneNumberId: string | null;
      status: {
        id: string;
        status: string;
        timestamp: string | null;
        recipientId: string | null;
        errors: { code?: number; title?: string; message?: string }[];
      };
    };

async function processMetaEvent(event: WebhookEvent): Promise<void> {
  const payload = event.payload as unknown as MetaEventPayload;
  if (payload.kind === "status") {
    const status = parseMetaDeliveryStatus(payload.status.status);
    if (!status) return;
    const error = payload.status.errors.length > 0
      ? payload.status.errors
          .map((item) =>
            [item.code, item.title, item.message].filter(Boolean).join(" — ")
          )
          .join("; ")
          .slice(0, 500)
      : null;
    await applyMetaDeliveryStatus({
      waMessageId: payload.status.id,
      status,
      error: status === "FAILED" ? error : null,
      statusAt: metaStatusDate(payload.status.timestamp ?? undefined),
    });
    return;
  }
  if (payload.kind !== "message") return;

  const workspaceId = event.workspaceId ?? (payload.phoneNumberId
    ? await resolveWorkspaceByPhoneNumberId(payload.phoneNumberId)
    : null);
  if (!workspaceId) {
    throw new Error("رقم واتساب غير مرتبط بمساحة عمل بعد");
  }

  await handleIncomingWhatsAppMessage({
    ...payload.input,
    workspaceId,
  });
  if (!event.workspaceId) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { workspaceId },
    });
  }
}

type UltraMsgEventPayload = {
  instanceId: string | null;
  externalId: string;
  data: {
    from?: string;
    type?: string;
    body?: string;
    media?: string;
    caption?: string;
    pushname?: string;
    name?: string;
  };
};

async function processUltraMsgEvent(event: WebhookEvent): Promise<void> {
  const payload = event.payload as unknown as UltraMsgEventPayload;
  const data = payload.data ?? {};
  const workspaceId = event.workspaceId ?? (payload.instanceId
    ? await resolveWorkspaceByUltraMsgInstance(payload.instanceId)
    : null);
  if (!workspaceId) {
    throw new Error("نسخة UltraMsg غير مرتبطة بمساحة عمل بعد");
  }

  const waPhone = data.from?.replace("@c.us", "") ?? "";
  if (!waPhone) return;
  const mediaType = data.type ? ULTRAMSG_MEDIA_TYPES[data.type] : undefined;
  const bodyOrMedia = data.body ?? data.media ?? "";
  let mediaUrl: string | undefined;
  let mediaAssetId: string | undefined;
  let mediaMime: string | null = null;

  if (mediaType && bodyOrMedia) {
    if (bodyOrMedia.startsWith("http")) {
      mediaUrl = bodyOrMedia;
    } else {
      const decoded = decodeDataUri(bodyOrMedia) ?? (() => {
        try {
          return {
            buffer: Buffer.from(bodyOrMedia, "base64"),
            mime: "application/octet-stream",
          };
        } catch {
          return null;
        }
      })();
      if (decoded && decoded.buffer.length > 0 && decoded.buffer.length <= 4 * 1024 * 1024) {
        const asset = await saveMediaAsset({
          workspaceId,
          buffer: decoded.buffer,
          mime: decoded.mime,
          filename: `وارد-${mediaType}`,
        });
        mediaAssetId = asset.id;
        mediaMime = decoded.mime;
      }
    }
  }

  const text = data.type === "chat" || !data.type
    ? data.body ?? ""
    : data.caption?.trim()
      ? data.caption.trim()
      : placeholderFor(data.type);
  if (!text && !mediaUrl) return;

  await handleIncomingWhatsAppMessage({
    waPhone,
    waMessageId: `ultramsg:${payload.externalId}`,
    contactName: data.pushname ?? data.name ?? null,
    text,
    workspaceId,
    media: mediaUrl
      ? { mediaId: mediaUrl, mediaMime: null, mediaType: mediaType ?? null }
      : mediaAssetId
        ? { mediaId: `asset:${mediaAssetId}`, mediaMime, mediaType: mediaType ?? null }
        : undefined,
  });
  if (!event.workspaceId) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { workspaceId },
    });
  }
}

export async function processStoredWebhookEvent(
  event: WebhookEvent
): Promise<void> {
  if (event.provider === "META") return processMetaEvent(event);
  if (event.provider === "ULTRAMSG") return processUltraMsgEvent(event);
  throw new Error(`مزود Webhook غير معروف: ${event.provider}`);
}
