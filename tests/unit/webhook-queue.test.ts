import type { WebhookEvent } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  update: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      createMany: mocks.createMany,
      update: mocks.update,
    },
    $queryRaw: mocks.queryRaw,
  },
}));

import {
  enqueueWebhookEvent,
  processWebhookQueue,
} from "@/lib/webhook-queue";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("durable webhook queue", () => {
  it("uses the unique provider/event key for idempotent enqueueing", async () => {
    mocks.createMany.mockResolvedValue({ count: 0 });

    await expect(enqueueWebhookEvent({
      provider: "META",
      externalId: "message:wamid.1",
      workspaceId: "ws-1",
      payload: { kind: "message" },
    })).resolves.toBe(false);

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: {
        provider: "META",
        externalId: "message:wamid.1",
        workspaceId: "ws-1",
        payload: { kind: "message" },
      },
      skipDuplicates: true,
    });
  });

  it("returns a failed event to retry with backoff instead of losing it", async () => {
    const event = {
      id: "event-1",
      provider: "META",
      externalId: "message:wamid.1",
      attempts: 1,
    } as WebhookEvent;
    mocks.queryRaw.mockResolvedValue([event]);
    mocks.update.mockResolvedValue({});

    await expect(processWebhookQueue(async () => {
      throw new Error("temporary failure");
    })).resolves.toEqual({ processed: 0, failed: 0, retried: 1 });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        status: "RETRY",
        lockedAt: null,
        lastError: "temporary failure",
        availableAt: expect.any(Date),
      }),
    });
  });
});
