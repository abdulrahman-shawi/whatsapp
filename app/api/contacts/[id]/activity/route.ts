import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { stageConfig } from "@/lib/contact-stages";

// سجل نشاط العميل — خط زمني موحّد: رسائله، حجوزاته، وتغيّرات مرحلته
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

  const [messages, bookings, stageHistory, lastInbound] = await Promise.all([
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
    prisma.contactStageHistory.findMany({
      where: { contactId: params.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, stage: true, createdAt: true },
    }),
    // آخر ظهور: أحدث رسالة واردة من العميل
    prisma.message.findFirst({
      where: { conversation: { contactId: params.id }, direction: "INBOUND", isNote: false },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return NextResponse.json({
    lastSeenAt: lastInbound?.createdAt.toISOString() ?? null,
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
      ...stageHistory.map((s) => ({
        type: "stage",
        id: s.id,
        stage: s.stage,
        stageLabel: stageConfig(s.stage).label,
        ai: false,
        createdAt: s.createdAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}
