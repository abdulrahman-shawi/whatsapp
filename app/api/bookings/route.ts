import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// GET: حجوزات مساحة العمل ضمن نطاق زمني — ?contactId= يحصرها لعميل واحد (لوحة جهة الاتصال)
// ‎?from= &to= (ISO) للتقويم الشهري — الافتراضي: من الشهر الحالي ±شهر
// POST: إنشاء حجز يدوي { waPhone, title, scheduledAt, notes }
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const contactId = params.get("contactId");

  if (contactId) {
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

  const now = new Date();
  const from = params.get("from") ? new Date(params.get("from")!) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = params.get("to") ? new Date(params.get("to")!) : new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const bookings = await prisma.booking.findMany({
    where: { workspaceId: ctx.workspaceId, scheduledAt: { gte: from, lt: to } },
    orderBy: { scheduledAt: "asc" },
    include: { contact: { select: { id: true, name: true, waPhone: true } } },
  });
  return NextResponse.json({
    bookings: bookings.map((b) => ({
      ...b,
      scheduledAt: b.scheduledAt.toISOString(),
      createdAt: b.createdAt.toISOString(),
      remindedAt: b.remindedAt ? b.remindedAt.toISOString() : null,
    })),
  });
}

export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  let body: { waPhone?: string; title?: string; scheduledAt?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const waPhone = body.waPhone?.trim();
  const title = body.title?.trim();
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (!waPhone || !title || !scheduledAt || isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "الرقم والعنوان والموعد مطلوبة" }, { status: 400 });
  }

  // العميل موجود يُستخدم، غير ذلك يُنشأ — كما في الوارد
  const contact = await prisma.contact.upsert({
    where: { workspaceId_waPhone: { workspaceId: ctx.workspaceId, waPhone } },
    update: {},
    create: { workspaceId: ctx.workspaceId, waPhone },
  });
  const booking = await prisma.booking.create({
    data: {
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      title,
      scheduledAt,
      notes: body.notes?.trim() || null,
    },
  });
  return NextResponse.json({ booking }, { status: 201 });
}
