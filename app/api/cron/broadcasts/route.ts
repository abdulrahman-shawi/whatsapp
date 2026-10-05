import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBroadcast } from "@/lib/broadcast";

// معالجة الحملات المجدولة المستحقة: يُستدعى كل ٥ دقائق عبر cron (انظر vercel.json)
// الحماية عبر: Authorization: Bearer ${CRON_SECRET}
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  // الحملات المجدولة التي حان موعدها
  const due = await prisma.broadcastCampaign.findMany({
    where: { status: "QUEUED", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: 10,
  });

  // إرسال متسلسل: فشل حملة واحدة لا يوقف بقية الحملات المستحقة
  let processed = 0;
  for (const campaign of due) {
    try {
      await sendBroadcast(campaign.id);
      processed++;
    } catch (e) {
      console.error(
        `[cron/broadcasts] فشل إرسال الحملة ${campaign.id}:`,
        e
      );
    }
  }

  return NextResponse.json({ processed, due: due.length });
}
