import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@/lib/secret-crypto";

beforeAll(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("integration secret encryption", () => {
  it("round-trips a secret with a random IV", () => {
    const context = "workspace:ws-1:integration:WHATSAPP_TOKEN";
    const first = encryptSecret("secret-token", context);
    const second = encryptSecret("secret-token", context);

    expect(isEncryptedSecret(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(first).not.toContain("secret-token");
    expect(decryptSecret(first, context)).toBe("secret-token");
    expect(decryptSecret(second, context)).toBe("secret-token");
  });

  it("rejects use in another workspace or integration context", () => {
    const encrypted = encryptSecret(
      "secret-token",
      "workspace:ws-1:integration:WHATSAPP_TOKEN"
    );

    expect(() =>
      decryptSecret(encrypted, "workspace:ws-2:integration:WHATSAPP_TOKEN")
    ).toThrow();
    expect(() =>
      decryptSecret(encrypted, "workspace:ws-1:integration:META_APP_SECRET")
    ).toThrow();
  });

  it("keeps legacy plaintext readable for the migration window", () => {
    expect(decryptSecret("legacy-token", "workspace:ws-1:integration:WHATSAPP_TOKEN"))
      .toBe("legacy-token");
  });
});
