import { NextResponse } from "next/server";
import type { ContactStage } from "@prisma/client";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CONTACT_STAGES } from "@/lib/contact-stages";

// قائمة عملاء مساحة العمل مع فلاتر: بحث (اسم/رقم)، مرحلة، وسم
// ‎?q= &stage= &tag= — تُعيد إحصاءات أساسية لكل عميل (عدد المحادثات، آخر رسالة)
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const stageParam = params.get("stage")?.trim();
  const tag = params.get("tag")?.trim();
  const sort = params.get("sort")?.trim();
  const stage = CONTACT_STAGES.some((s) => s.value === stageParam)
    ? (stageParam as ContactStage)
    : undefined;

  const contacts = await prisma.contact.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { waPhone: { contains: q } },
            ],
          }
        : {}),
      ...(stage ? { stage } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    // sort=score: الأعلى نقاطاً أولاً — افتراضياً الأحدث إضافةً
    orderBy:
      sort === "score"
        ? [{ leadScore: "desc" }, { createdAt: "desc" }]
        : { createdAt: "desc" },
    take: 300,
    include: {
      conversations: {
        orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
        take: 1,
        select: { id: true, lastMessageAt: true, status: true },
      },
      _count: { select: { conversations: true, bookings: true } },
    },
  });

  return NextResponse.json({
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      waPhone: c.waPhone,
      stage: c.stage,
      leadScore: c.leadScore,
      tags: c.tags,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      conversationCount: c._count.conversations,
      bookingCount: c._count.bookings,
      lastConversation: c.conversations[0]
        ? {
            id: c.conversations[0].id,
            status: c.conversations[0].status,
            lastMessageAt: c.conversations[0].lastMessageAt?.toISOString() ?? null,
          }
        : null,
    })),
  });
}
