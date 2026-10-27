import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature } from "@/lib/meta-webhook";

function signature(body: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("Meta webhook signature", () => {
  const body = JSON.stringify({ entry: [{ id: "123" }] });

  it("accepts a valid signature from any configured workspace secret", () => {
    expect(verifyMetaSignature(body, signature(body, "secret-b"), ["secret-a", "secret-b"]))
      .toBe(true);
  });

  it("fails closed when no app secret is configured", () => {
    expect(verifyMetaSignature(body, signature(body, "secret"), [])).toBe(false);
  });

  it("rejects missing, malformed, and incorrect signatures", () => {
    expect(verifyMetaSignature(body, null, ["secret"])).toBe(false);
    expect(verifyMetaSignature(body, "sha256=wrong", ["secret"])).toBe(false);
    expect(verifyMetaSignature(body, signature(body, "other"), ["secret"])).toBe(false);
    expect(verifyMetaSignature(`${body} `, signature(body, "secret"), ["secret"]))
      .toBe(false);
  });
});
