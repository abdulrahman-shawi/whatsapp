import type { MessageDeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WhatsAppResult } from "@/lib/whatsapp";

const STATUS_ORDER: MessageDeliveryStatus[] = [
  "PENDING",
  "ACCEPTED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
];

export function deliveryStatusRank(status: MessageDeliveryStatus): number {
  return STATUS_ORDER.indexOf(status);
}

export function parseMetaDeliveryStatus(
  status: string
): MessageDeliveryStatus | null {
  switch (status) {
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "read":
      return "READ";
    case "failed":
      return "FAILED";
    default:
      return null;
  }
}

export function outboundDeliveryFields(
  result: WhatsAppResult,
  now = new Date()
): {
  waMessageId: string | null;
  deliveryStatus: "ACCEPTED" | "FAILED";
  deliveryError: string | null;
  statusUpdatedAt: Date;
} {
  return {
    waMessageId: result.ok ? result.messageId : null,
    deliveryStatus: result.ok ? "ACCEPTED" : "FAILED",
    deliveryError: result.error,
    statusUpdatedAt: now,
  };
}

/**
 * يحدّث الحالة ذرّياً إلى مرحلة أعلى فقط. شرط WHERE يمنع حدثاً قديماً
 * أو عاملاً متزامناً من إرجاع READ إلى DELIVERED مثلاً.
 */
export async function applyMetaDeliveryStatus(input: {
  waMessageId: string;
  status: MessageDeliveryStatus;
  error: string | null;
  statusAt: Date;
}): Promise<boolean> {
  const rank = deliveryStatusRank(input.status);
  const previousStatuses = STATUS_ORDER.slice(0, Math.max(0, rank));
  if (previousStatuses.length === 0) return false;

  const updated = await prisma.message.updateMany({
    where: {
      waMessageId: input.waMessageId,
      deliveryStatus: { in: previousStatuses },
    },
    data: {
      deliveryStatus: input.status,
      deliveryError: input.error,
      statusUpdatedAt: input.statusAt,
    },
  });
  return updated.count > 0;
}

export function metaStatusDate(timestamp: string | undefined): Date {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date();
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
