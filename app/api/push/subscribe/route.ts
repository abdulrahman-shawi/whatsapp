import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// اشتراك Push لجلسة المستخدم الحالية
// POST: {endpoint, keys:{p256dh, auth}} — إنشاء أو تحديث حسب endpoint (فريد عالمياً)
// DELETE: {endpoint} — إلغاء اشتراك يملكه المستخدم نفسه
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "بيانات اشتراك غير مكتملة" }, { status: 400 });
  }

  // endpoint فريد — نربطه دائماً بالمستخدم الحالي (تسجيل من متصفح جديد ينقل الاشتراك)
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: ctx.userId, keys: { p256dh, auth } },
    create: { userId: ctx.userId, endpoint, keys: { p256dh, auth } },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    endpoint?: string;
  } | null;
  const endpoint = body?.endpoint;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint مطلوب" }, { status: 400 });
  }

  // يحذف المستخدم اشتراكه فقط
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: ctx.userId },
  });
  return NextResponse.json({ ok: true });
}
