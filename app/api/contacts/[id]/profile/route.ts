import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// ملف العميل الكامل لنافذة التفاصيل: جهة الاتصال + المحادثات الأخيرة + الحجوزات + عدّادات
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: {
      id: true,
      name: true,
      email: true,
      waPhone: true,
      notes: true,
      tags: true,
      stage: true,
      leadScore: true,
      blocked: true,
      createdAt: true,
      _count: { select: { conversations: true, bookings: true } },
    },
  });
  if (!contact) {
    return NextResponse.json({ error: "جهة الاتصال غير موجودة" }, { status: 404 });
  }

  const [conversations, bookings] = await Promise.all([
    prisma.conversation.findMany({
      where: { contactId: contact.id, workspaceId: ctx.workspaceId },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      take: 10,
      select: {
        id: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        closedAt: true,
        isArchived: true,
        summary: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.booking.findMany({
      where: { contactId: contact.id, workspaceId: ctx.workspaceId },
      orderBy: { scheduledAt: "desc" },
      take: 20,
      select: { id: true, title: true, scheduledAt: true, notes: true },
    }),
  ]);

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      waPhone: contact.waPhone,
      notes: contact.notes,
      tags: contact.tags,
      stage: contact.stage,
      leadScore: contact.leadScore,
      blocked: contact.blocked,
      createdAt: contact.createdAt.toISOString(),
      conversationCount: contact._count.conversations,
      bookingCount: contact._count.bookings,
    },
    conversations: conversations.map((c) => ({
      id: c.id,
      status: c.status,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      closedAt: c.closedAt?.toISOString() ?? null,
      isArchived: c.isArchived,
      summary: c.summary,
      messageCount: c._count.messages,
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      title: b.title,
      scheduledAt: b.scheduledAt.toISOString(),
      notes: b.notes,
    })),
  });
}
