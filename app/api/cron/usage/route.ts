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

  // مساحات العمل التي تجاوزت 80% من حدها الشهري
  const alerts = records
    .filter((r) => r.messagesUsed >= r.messageLimit * 0.8)
    .map((r) => ({
      workspaceId: r.workspaceId,
      used: r.messagesUsed,
      limit: r.messageLimit,
      percent: Math.round((r.messagesUsed / r.messageLimit) * 100),
    }));

  for (const a of alerts) {
    // TODO: هنا يُرسل تنبيه فعلي للعميل بالبريد أو واتساب (مثلاً عبر Resend)
    console.warn(
      `[usage-alert] مساحة العمل ${a.workspaceId} استهلكت ${a.percent}% (${a.used}/${a.limit})`
    );
  }

  return NextResponse.json({ alerts });
}
