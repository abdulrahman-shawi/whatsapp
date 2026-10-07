import { NextResponse } from "next/server";

// المفتاح العام لـ VAPID — يستخدمه العميل للاشتراك في Push
// فارغ إن لم تُهيّأ المفاتيح على الخادم (تظهر ملاحظة في واجهة التفعيل)
export async function GET() {
  return NextResponse.json({
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  });
}
