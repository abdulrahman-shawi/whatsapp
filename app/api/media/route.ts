import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getIntegration } from "@/lib/settings";

// حد تخزين نسخة محلية من الوسائط القادمة من المزود (روابط ميتا المؤقتة قد تنتهي)
const CACHE_MAX_SIZE = 8 * 1024 * 1024;

// وسيط عرض وسائط واتساب: يجلب الملف من المزود (ميتا برابط مؤقت، أو رابط UltraMsg مباشر)
// ويبثه للموظف. عند أول نجاح نخزن نسخة محلية ونحدّث الرسالة إليها —
// فتبقى الوسائط قابلة للتشغيل حتى بعد انتهاء صلاحية رابط ميتا المؤقت.
// التخويل: معرّف الوسائط يجب أن يخص رسالة من محادثة في مساحة عمل المستخدم
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const mediaId = new URL(req.url).searchParams.get("id");
  if (!mediaId) {
    return NextResponse.json({ error: "معرّف الوسائط مطلوب" }, { status: 400 });
  }

  // الرسالة الحاملة لهذا المعرف يجب أن تتبع مساحة عمل المستخدم
  const message = await prisma.message.findFirst({
    where: { mediaId, conversation: { workspaceId: ctx.workspaceId } },
    select: { id: true },
  });
  if (!message) {
    return NextResponse.json({ error: "الوسائط غير موجودة" }, { status: 404 });
  }

  // الوسائط المخزنة محلياً في المخزن (وارد UltraMsg base64 أو ملفات مرفوعة أو نسخة مخبأة)
  if (mediaId.startsWith("asset:")) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId.slice("asset:".length), workspaceId: ctx.workspaceId },
    });
    if (!asset) {
      return NextResponse.json({ error: "الوسائط غير موجودة" }, { status: 404 });
    }
    return assetResponse(
      Buffer.from(asset.dataBase64, "base64"),
      asset.mime,
      asset.filename
    );
  }

  try {
    let remote: Response;

    // روابط UltraMsg المباشرة: نبثها كما هي دون الرجوع لميتا
    if (mediaId.startsWith("http://") || mediaId.startsWith("https://")) {
      remote = await fetch(mediaId);
      if (!remote.ok) {
        return NextResponse.json({ error: "تعذر تنزيل الوسائط" }, { status: 502 });
      }
    } else {
      // الخطوة 1: ميتا تعيد رابطاً مؤقتاً للملف (يحتاج التوكن)
      const token = await getIntegration(ctx.workspaceId, "WHATSAPP_TOKEN");
      if (!token) {
        return NextResponse.json({ error: "توكن واتساب غير مضبوط" }, { status: 500 });
      }
      const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meta.ok) {
        return NextResponse.json({ error: "تعذر جلب الوسائط من ميتا" }, { status: 502 });
      }
      const { url } = (await meta.json()) as { url?: string };
      if (!url) {
        return NextResponse.json({ error: "رابط الوسائط مفقود" }, { status: 502 });
      }
      // الخطوة 2: تنزيل الملف نفسه من الرابط المؤقت
      remote = await fetch(url);
      if (!remote.ok) {
        return NextResponse.json({ error: "تعذر تنزيل الوسائط" }, { status: 502 });
      }
    }

    const bytes = Buffer.from(await remote.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json({ error: "الملف فارغ" }, { status: 502 });
    }
    const mime =
      remote.headers.get("Content-Type")?.split(";")[0]?.trim() ||
      "application/octet-stream";

    // تخزين نسخة محلية وإعادة توجيه الرسالة إليها — أفضل جهد، لا يعطّل العرض
    if (bytes.length <= CACHE_MAX_SIZE) {
      try {
        const asset = await prisma.mediaAsset.create({
          data: {
            workspaceId: ctx.workspaceId,
            filename: `وسائط-${mediaId.slice(0, 12)}`,
            mime,
            dataBase64: bytes.toString("base64"),
          },
        });
        await prisma.message.update({
          where: { id: message.id },
          data: { mediaId: `asset:${asset.id}` },
        });
      } catch {
        // فشل التخزين لا يمنع التشغيل هذه المرة
      }
    }

    return new Response(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "private, max-age=3600",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "خطأ أثناء جلب الوسائط" }, { status: 500 });
  }
}

function assetResponse(bytes: Buffer, mime: string, filename: string): Response {
  return new Response(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=3600",
      },
    }
  );
}
