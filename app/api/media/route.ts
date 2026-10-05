import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getIntegration } from "@/lib/settings";

// وسيط عرض وسائط واتساب: يجلب الملف من خوادم ميتا بتوكن مساحة العمل
// ويبثه للموظف — لا نخزن الملفات محلياً
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

  const token = await getIntegration(ctx.workspaceId, "WHATSAPP_TOKEN");
  if (!token) {
    return NextResponse.json({ error: "توكن واتساب غير مضبوط" }, { status: 500 });
  }

  try {
    // الخطوة 1: ميتا تعيد رابطاً مؤقتاً للملف
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

    // الخطوة 2: بث الباينات كما هي مع نوعها
    const file = await fetch(url);
    if (!file.ok || !file.body) {
      return NextResponse.json({ error: "تعذر تنزيل الوسائط" }, { status: 502 });
    }
    return new Response(file.body, {
      headers: {
        "Content-Type":
          file.headers.get("Content-Type") ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "خطأ أثناء جلب الوسائط" }, { status: 500 });
  }
}
