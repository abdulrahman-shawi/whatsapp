import { prisma } from "@/lib/prisma";

// حفظ ملف وسائط في مخزن المساحة (MediaAsset) وإعادة معرّفه
// يُستخدم في رفع الواجهات وفي ويب هوك UltraMsg عند وصول الوسائط base64
export async function saveMediaAsset(input: {
  workspaceId: string;
  buffer: Buffer;
  mime: string;
  filename: string;
}): Promise<{ id: string; filename: string; mime: string }> {
  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId: input.workspaceId,
      filename: input.filename,
      mime: input.mime,
      dataBase64: input.buffer.toString("base64"),
    },
  });
  return { id: asset.id, filename: asset.filename, mime: asset.mime };
}

// فك ترميز data URI (data:mime;base64,....) إلى باينات ونوعها
// يعيد null إن لم تكن السلسلة data URI صالحة
export function decodeDataUri(
  dataUri: string
): { buffer: Buffer; mime: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUri.trim());
  if (!match || !match[2]) return null;
  try {
    return {
      buffer: Buffer.from(match[3], "base64"),
      mime: match[1] || "application/octet-stream",
    };
  } catch {
    return null;
  }
}
