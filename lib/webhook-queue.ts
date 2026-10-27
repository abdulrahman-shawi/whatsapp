import { Prisma, type WebhookEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type WebhookEventInput = {
  provider: "META" | "ULTRAMSG";
  externalId: string;
  workspaceId?: string | null;
  payload: unknown;
};

/** يحفظ الحدث قبل الرد للمزود. القيد الفريد يجعل إعادة التسليم بلا أثر. */
export async function enqueueWebhookEvent(
  input: WebhookEventInput
): Promise<boolean> {
  const result = await prisma.webhookEvent.createMany({
    data: {
      provider: input.provider,
      externalId: input.externalId,
      workspaceId: input.workspaceId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
    },
    skipDuplicates: true,
  });
  return result.count > 0;
}

/**
 * استلام ذري: SKIP LOCKED يمنع عاملين من معالجة الحدث نفسه.
 * أحداث PROCESSING العالقة تعاد بعد خمس دقائق للتعافي من انهيار العامل.
 */
export async function claimWebhookEvents(limit = 10): Promise<WebhookEvent[]> {
  return prisma.$queryRaw<WebhookEvent[]>`
    WITH candidates AS (
      SELECT id
      FROM "WebhookEvent"
      WHERE (
        status IN ('PENDING', 'RETRY') AND "availableAt" <= NOW()
      ) OR (
        status = 'PROCESSING' AND "lockedAt" < NOW() - INTERVAL '5 minutes'
      )
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "WebhookEvent" AS event
    SET
      status = 'PROCESSING',
      "lockedAt" = NOW(),
      attempts = attempts + 1
    FROM candidates
    WHERE event.id = candidates.id
    RETURNING event.*;
  `;
}

export async function processWebhookQueue(
  handler: (event: WebhookEvent) => Promise<void>,
  limit = 10
): Promise<{ processed: number; failed: number; retried: number }> {
  const events = await claimWebhookEvents(limit);
  let processed = 0;
  let failed = 0;
  let retried = 0;

  for (const event of events) {
    try {
      await handler(event);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      processed++;
    } catch (error) {
      const exhausted = event.attempts >= 5;
      const delayMs = Math.min(2 ** event.attempts * 1000, 60_000);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: exhausted ? "FAILED" : "RETRY",
          availableAt: new Date(Date.now() + delayMs),
          lockedAt: null,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "خطأ غير معروف",
        },
      });
      if (exhausted) failed++;
      else retried++;
    }
  }

  return { processed, failed, retried };
}
