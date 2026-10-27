import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: { setting: { findMany } },
}));

import { encryptSecret } from "@/lib/secret-crypto";
import {
  integrationSecretContext,
  resolveWorkspaceByPhoneNumberId,
  resolveWorkspaceByUltraMsgInstance,
} from "@/lib/settings";

beforeAll(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});

beforeEach(() => {
  findMany.mockReset();
});

describe("encrypted integration routing", () => {
  it("resolves the correct workspace after phone number ids are encrypted", async () => {
    findMany.mockResolvedValue([
      {
        workspaceId: "ws-1",
        value: encryptSecret(
          "phone-1",
          integrationSecretContext("ws-1", "WHATSAPP_PHONE_NUMBER_ID")
        ),
      },
      {
        workspaceId: "ws-2",
        value: encryptSecret(
          "phone-2",
          integrationSecretContext("ws-2", "WHATSAPP_PHONE_NUMBER_ID")
        ),
      },
    ]);

    await expect(resolveWorkspaceByPhoneNumberId("phone-2")).resolves.toBe("ws-2");
    await expect(resolveWorkspaceByPhoneNumberId("missing")).resolves.toBeNull();
  });

  it("resolves UltraMsg instances without cross-workspace fallback", async () => {
    findMany.mockResolvedValue([
      {
        workspaceId: "ws-1",
        value: encryptSecret(
          "instance-1",
          integrationSecretContext("ws-1", "ULTRAMSG_INSTANCE_ID")
        ),
      },
    ]);

    await expect(resolveWorkspaceByUltraMsgInstance("instance-1")).resolves.toBe("ws-1");
    await expect(resolveWorkspaceByUltraMsgInstance("instance-2")).resolves.toBeNull();
  });
});
