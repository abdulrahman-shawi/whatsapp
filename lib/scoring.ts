import { prisma } from "@/lib/prisma";

// أوزان تقييم العميل المحتمل (0–100) — حتمية وبسيطة:
// • المرحلة الحالية (حتى 40): عميل مشترٍ 40، مقفل للتراسل 30، مهتم 22، جاري التواصل 12، جديد 5، ضائع 0
// • حداثة الرسائل الواردة (حتى 20): رسالة واردة خلال ٧ أيام = 20، خلال ٣٠ يوماً = 10، وإلا 0
// • الحجوزات (حتى 30): 10 نقاط لكل حجز بحد أقصى 3
// • الوسوم (حتى 10): نقطتان لكل وسم بحد أقصى 5
const STAGE_WEIGHTS: Record<string, number> = {
  CUSTOMER: 40,
  NEGOTIATING: 30,
  INTERESTED: 22,
  CONTACTING: 12,
  NEW: 5,
  LOST: 0,
};

export async function recalculateLeadScore(contactId: string): Promise<number> {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { stage: true, tags: true, _count: { select: { bookings: true } } },
    });
    if (!contact) return 0;

    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [inbound7d, inbound30d] = await Promise.all([
      prisma.message.count({
        where: {
          direction: "INBOUND",
          conversation: { contactId },
          createdAt: { gte: weekAgo },
        },
      }),
      prisma.message.count({
        where: {
          direction: "INBOUND",
          conversation: { contactId },
          createdAt: { gte: monthAgo },
        },
      }),
    ]);

    const stageScore = STAGE_WEIGHTS[contact.stage] ?? 0;
    const recencyScore = inbound7d > 0 ? 20 : inbound30d > 0 ? 10 : 0;
    const bookingScore = Math.min(contact._count.bookings, 3) * 10;
    const tagScore = Math.min(contact.tags.length, 5) * 2;

    const score = Math.min(
      100,
      stageScore + recencyScore + bookingScore + tagScore
    );

    await prisma.contact.update({
      where: { id: contactId },
      data: { leadScore: score },
    });
    return score;
  } catch (e) {
    console.error("[scoring] تعذّر احتساب نقاط العميل:", e);
    return 0;
  }
}
