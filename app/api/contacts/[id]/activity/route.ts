import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// سجل نشاط العميل — خط زمني موحّد: رسائله، حجوزاته، وتنبيهاته
// يُدمج ويُرتَّب زمنياً تنازلياً في الواجهة
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const [messages, bookings] = await Promise.all([
    prisma.message.findMany({
      where: { conversation: { contactId: params.id }, isNote: false },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        body: true,
        direction: true,
        senderType: true,
        createdAt: true,
      },
    }),
    prisma.booking.findMany({
      where: { contactId: params.id },
      orderBy: { scheduledAt: "desc" },
      take: 20,
      select: { id: true, title: true, scheduledAt: true, notes: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    events: [
      ...messages.map((m) => ({
        type: m.direction === "INBOUND" ? "message_in" : "message_out",
        id: m.id,
        body: m.body,
        ai: m.senderType === "AI",
        createdAt: m.createdAt.toISOString(),
      })),
      ...bookings.map((b) => ({
        type: "booking",
        id: b.id,
        body: b.title,
        notes: b.notes,
        createdAt: b.scheduledAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}
