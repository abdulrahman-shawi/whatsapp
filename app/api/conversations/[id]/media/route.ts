import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  mediaTypeForMime,
  resolveWhatsAppCreds,
  sendWhatsAppMedia,
  uploadWhatsAppMedia,
  getLastWhatsAppError,
} from "@/lib/whatsapp";
import { triggerNewMessage, triggerConversationUpdated } from "@/lib/pusher";
import { saveMediaAsset } from "@/lib/assets";

type Params = { params: { id: string } };

const MAX_FILE_SIZE = 16 * 1024 * 1024; // حد ميتا المعتاد: 16MB

// إرسال رسالة وسائط (صورة/مستند/صوت/فيديو) من المحادثة — ميتا وUltraMsg
// يستقبل FormData: file (الملف) + caption (تسمية توضيحية اختيارية)
export async function POST(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    include: { contact: { select: { waPhone: true } } },
  });
  if (!conversation) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const file = form.get("file");
  const caption = typeof form.get("caption") === "string"
    ? (form.get("caption") as string).trim()
    : "";
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "حجم الملف يتجاوز 16MB" }, { status: 400 });
  }

  const creds = await resolveWhatsAppCreds(ctx.workspaceId);
  if (!creds) {
    return NextResponse.json(
      { error: "مزود واتساب غير مضبوط في الإعدادات" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mediaType = mediaTypeForMime(file.type || "application/octet-stream");

  // ميتا: نرفع الملف لخوادمها أولاً للحصول على معرّف وسائط
  // UltraMsg: يرسل الملف مباشرة كـ base64 — نخزنه محلياً كأصل لعرضه في الوارد
  let mediaId: string | null = null;
  if (creds.provider === "meta") {
    mediaId = await uploadWhatsAppMedia(
      {
        buffer,
        mime: file.type || "application/octet-stream",
        filename: file.name,
      },
      creds
    );
    if (!mediaId) {
      const detail = getLastWhatsAppError();
      return NextResponse.json(
        { error: "فشل رفع الملف إلى ميتا" + (detail ? ` — ${detail}` : "") },
        { status: 502 }
      );
    }
  } else {
    const asset = await saveMediaAsset({
      workspaceId: ctx.workspaceId,
      buffer,
      mime: file.type || "application/octet-stream",
      filename: file.name || "ملف",
    });
    mediaId = `asset:${asset.id}`;
  }

  // تخزين الرسالة قبل الإرسال الخارجي — نفس منطق الرسائل النصية
  const message = await prisma.message.create({
    data: {
      conversationId: params.id,
      direction: "OUTBOUND",
      senderType: "HUMAN",
      body: caption || `[${mediaType === "image" ? "صورة" : mediaType === "audio" ? "رسالة صوتية" : mediaType === "video" ? "مقطع فيديو" : "مستند"}]`,
      senderId: ctx.userId,
      mediaId,
      mediaMime: file.type || null,
      mediaType,
    },
  });
  await prisma.conversation.update({
    where: { id: params.id },
    data: { lastMessageAt: new Date() },
  });

  triggerNewMessage(ctx.workspaceId, params.id, {
    ...message,
    createdAt: message.createdAt.toISOString(),
    senderName: null,
  });
  triggerConversationUpdated(ctx.workspaceId, params.id);

  const waSent = await sendWhatsAppMedia(
    conversation.contact.waPhone,
    {
      mediaId: mediaId ?? "",
      mediaType,
      mime: file.type || "application/octet-stream",
      filename: file.name,
      caption: caption || undefined,
      // UltraMsg فقط: الملف الخام لترميزه base64 عند الإرسال
      buffer: creds.provider === "ultramsg" ? buffer : undefined,
    },
    creds
  );

  return NextResponse.json(
    {
      message: {
        ...message,
        createdAt: message.createdAt.toISOString(),
        senderName: null,
      },
      waSent,
      // سبب فشل الإرسال إلى واتساب إن وجد — ليظهر للمستخدم في التنبيه
      waError: waSent ? null : getLastWhatsAppError(),
    },
    { status: 201 }
  );
}
