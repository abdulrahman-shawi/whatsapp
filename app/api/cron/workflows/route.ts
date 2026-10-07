import { NextResponse } from "next/server";
import {
  resumeWaitingWorkflowRuns,
  runNoReplyWorkflows,
} from "@/lib/workflows";
import { sendDueScheduledMessages } from "@/lib/conversations";
import { sendBookingReminders } from "@/lib/bookings";

// استئناف خطوات "انتظار" + فحص محفّز "لا رد" + إرسال الرسائل المجدولة
// يعمل عبر كرون Vercel (مرة يومياً على الخطة المجانية) أو نداء خارجي دوري
// إلى هذا المسار مع ترويسة Authorization: Bearer ${CRON_SECRET}
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  // كل مرحلة معزولة — فشل واحد (مثلاً نوم قاعدة البيانات) لا يمنع بقيتها
  const errors: string[] = [];
  const run = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message.slice(0, 200) : "خطأ"}`);
      console.error(`[cron] فشل مرحلة ${label}:`, e);
      return null;
    }
  };

  const resumed = await run("استئناف سير العمل", resumeWaitingWorkflowRuns);
  const noReplyFired = await run("محفز لا رد", runNoReplyWorkflows);
  const scheduled = await run("الرسائل المجدولة", sendDueScheduledMessages);
  const bookingReminders = await run("تذكير الحجوزات", sendBookingReminders);

  return NextResponse.json({
    resumed,
    noReplyFired,
    scheduled,
    bookingReminders,
    errors,
  });
}
