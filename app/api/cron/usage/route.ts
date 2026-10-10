import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// تنبيه الاستهلاك: يُستدعى يومياً عبر cron (انظر vercel.json)
// الحماية عبر: Authorization: Bearer ${CRON_SECRET}
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const month = new Date().toISOString().slice(0, 7); // مفتاح الشهر الحالي
  const records = await prisma.usageRecord.findMany({ where: { month } });

  // مساحات العمل التي تجاوزت 80% من حدها الشهري (رسائل أو توكنات)
  const alerts = records
    .filter(
      (r) =>
        r.messagesUsed >= r.messageLimit * 0.8 || r.tokensUsed >= r.tokenLimit * 0.8
    )
    .map((r) => ({
      workspaceId: r.workspaceId,
      used: r.messagesUsed,
      limit: r.messageLimit,
      tokensUsed: r.tokensUsed,
      tokenLimit: r.tokenLimit,
      percent: Math.round((r.messagesUsed / r.messageLimit) * 100),
      tokensPercent: Math.round((r.tokensUsed / r.tokenLimit) * 100),
    }));

  for (const a of alerts) {
    console.warn(
      `[usage-alert] مساحة العمل ${a.workspaceId}: رسائل ${a.percent}% (${a.used}/${a.limit}) — توكنات ${a.tokensPercent}% (${a.tokensUsed}/${a.tokenLimit})`
    );

    // تنبيه داخلي للفريق — مرة واحدة لكل شهر: نتخطى إن وُجد تنبيه USAGE_ALERT
    // غير مقروء لنفس المساحة منذ بداية الشهر الحالي
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const existing = await prisma.notification.findFirst({
        where: {
          workspaceId: a.workspaceId,
          type: "USAGE_ALERT",
          readAt: null,
          createdAt: { gte: monthStart },
        },
        select: { id: true },
      });
      if (existing) continue;

      const parts: string[] = [];
      if (a.limit > 0 && a.percent >= 80) {
        parts.push(`الرسائل ${a.percent}% (${a.used}/${a.limit})`);
      }
      if (a.tokenLimit > 0 && a.tokensPercent >= 80) {
        parts.push(`توكنات الذكاء الاصطناعي ${a.tokensPercent}% (${a.tokensUsed}/${a.tokenLimit})`);
      }
      await prisma.notification.create({
        data: {
          workspaceId: a.workspaceId,
          userId: null, // null = الفريق كله
          type: "USAGE_ALERT",
          title: "اقتراب حد الاستهلاك الشهري",
          body: `استهلاكك وصل ${parts.join(" — ")} من حد الباقة. رقِّ خطتك قبل توقف الرد الآلي.`,
          link: "/settings",
        },
      });
    } catch (e) {
      console.error("[usage-alert] تعذّر إنشاء إشعار الاستهلاك:", e);
    }
  }

  return NextResponse.json({ alerts });
}
