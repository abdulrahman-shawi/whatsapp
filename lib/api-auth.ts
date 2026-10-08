import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// مصادقة مفاتيح API للواجهة البرمجية العامة (/api/v1/*)
// المفتاح: fk_ + 48 خانة عشرية عشوائية — نخزّن هاشه فقط ولا يُعرض كاملاً إلا لحظة الإنشاء

const LAST_USED_THROTTLE_MS = 60_000;

// يستخرج المفتاح من ترويسة Authorization: Bearer fk_...
// يعيد { workspaceId, apiKeyId } أو null — لا يرمي استثناءات أبداً
export async function authenticateApiKey(
  req: Request
): Promise<{ workspaceId: string; apiKeyId: string } | null> {
  try {
    const header = req.headers.get("authorization") ?? "";
    const match = header.match(/^Bearer\s+(fk_[a-f0-9]{48})$/i);
    if (!match) return null;

    const key = match[1].toLowerCase();
    const keyHash = createHash("sha256").update(key).digest("hex");

    const apiKey = await prisma.apiKey.findFirst({
      where: { keyHash, revokedAt: null },
    });
    if (!apiKey) return null;

    // تحديث lastUsedAt بتحدٍّ — مرة واحدة على الأقل كل ٦٠ ثانية حتى لا نثقل الكتابة
    const stale =
      !apiKey.lastUsedAt ||
      Date.now() - apiKey.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
    if (stale) {
      void prisma.apiKey
        .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});
    }

    return { workspaceId: apiKey.workspaceId, apiKeyId: apiKey.id };
  } catch {
    return null;
  }
}
