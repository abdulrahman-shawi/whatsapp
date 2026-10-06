import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// حجوزات جهة اتصال — تُعرض في لوحة جهة الاتصال
// تُنشأ عبر خطوة CREATE_BOOKING في سير العمل (أو يدوياً لاحقاً)
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const contactId = new URL(req.url).searchParams.get("contactId") ?? "";
  if (!contactId) {
    return NextResponse.json({ error: "معرّف جهة الاتصال مطلوب" }, { status: 400 });
  }

  // التحقق من ملكية جهة الاتصال لمساحة العمل
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const bookings = await prisma.booking.findMany({
    where: { contactId },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });
  return NextResponse.json({ bookings });
}
