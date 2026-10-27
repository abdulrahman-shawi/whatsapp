import type { MessageDeliveryStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: { message: { updateMany } },
}));

import {
  applyMetaDeliveryStatus,
  outboundDeliveryFields,
  parseMetaDeliveryStatus,
} from "@/lib/message-delivery";

beforeEach(() => {
  updateMany.mockReset();
});

describe("outbound delivery results", () => {
  it("stores provider acceptance and the WhatsApp message id", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(outboundDeliveryFields({ ok: true, messageId: "wamid.1", error: null }, now))
      .toEqual({
        waMessageId: "wamid.1",
        deliveryStatus: "ACCEPTED",
        deliveryError: null,
        statusUpdatedAt: now,
      });
  });

  it("stores a failed send as failed rather than accepted", () => {
    const fields = outboundDeliveryFields({
      ok: false,
      messageId: null,
      error: "provider rejected the request",
    });
    expect(fields.deliveryStatus).toBe("FAILED");
    expect(fields.deliveryError).toContain("rejected");
    expect(fields.waMessageId).toBeNull();
  });

  it("maps only supported Meta status notifications", () => {
    expect(parseMetaDeliveryStatus("sent")).toBe("SENT");
    expect(parseMetaDeliveryStatus("delivered")).toBe("DELIVERED");
    expect(parseMetaDeliveryStatus("read")).toBe("READ");
    expect(parseMetaDeliveryStatus("failed")).toBe("FAILED");
    expect(parseMetaDeliveryStatus("unknown")).toBeNull();
  });
});

describe("monotone delivery status updates", () => {
  it("does not let an old delivered event downgrade a read message", async () => {
    let current: MessageDeliveryStatus = "READ";
    updateMany.mockImplementation(async ({ where, data }) => {
      if (where.deliveryStatus.in.includes(current)) {
        current = data.deliveryStatus;
        return { count: 1 };
      }
      return { count: 0 };
    });

    const updated = await applyMetaDeliveryStatus({
      waMessageId: "wamid.1",
      status: "DELIVERED",
      error: null,
      statusAt: new Date(),
    });

    expect(updated).toBe(false);
    expect(current).toBe("READ");
  });

  it("records failure and prevents a later stale event from reviving it", async () => {
    let current: MessageDeliveryStatus = "SENT";
    updateMany.mockImplementation(async ({ where, data }) => {
      if (where.deliveryStatus.in.includes(current)) {
        current = data.deliveryStatus;
        return { count: 1 };
      }
      return { count: 0 };
    });

    await expect(applyMetaDeliveryStatus({
      waMessageId: "wamid.1",
      status: "FAILED",
      error: "131026 — undeliverable",
      statusAt: new Date(),
    })).resolves.toBe(true);
    await expect(applyMetaDeliveryStatus({
      waMessageId: "wamid.1",
      status: "READ",
      error: null,
      statusAt: new Date(),
    })).resolves.toBe(false);
    expect(current).toBe("FAILED");
  });
});
