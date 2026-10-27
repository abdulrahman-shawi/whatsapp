import crypto from "crypto";

/** تحقق fail-closed من توقيع Meta؛ غياب السر أو الترويسة يرفض الطلب. */
export function verifyMetaSignature(
  rawBody: string,
  signature: string | null,
  secrets: string[]
): boolean {
  if (secrets.length === 0 || !signature?.startsWith("sha256=")) return false;
  const received = Buffer.from(signature);
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = Buffer.from(
      "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
    );
    if (
      received.length === expected.length &&
      crypto.timingSafeEqual(received, expected)
    ) {
      return true;
    }
  }
  return false;
}
