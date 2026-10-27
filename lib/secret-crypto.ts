import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const PREFIX = "v1";
let cachedKey: Buffer | null | undefined;

function encryptionKey(): Buffer {
  if (cachedKey !== undefined) {
    if (cachedKey) return cachedKey;
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY غير مضبوط. أنشئ مفتاحاً من 32 بايت قبل حفظ الأسرار."
    );
  }

  const raw = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!raw) {
    cachedKey = null;
    return encryptionKey();
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY يجب أن يكون Base64 لمفتاح 32 بايت");
  }
  cachedKey = key;
  return key;
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}.`);
}

/** AES-256-GCM مع AAD يربط النص المشفر بمساحة العمل والمفتاح المقصودين. */
export function encryptSecret(plaintext: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    PREFIX,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/** يدعم القيم النصية القديمة حتى يشغّل المالك ترحيل التشفير لمرة واحدة. */
export function decryptSecret(value: string, context: string): string {
  if (!isEncryptedSecret(value)) return value;

  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== PREFIX || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("صيغة السر المشفر غير صالحة");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
