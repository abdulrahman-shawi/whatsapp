import { NextResponse } from "next/server";
import {
  resumeWaitingWorkflowRuns,
  runNoReplyWorkflows,
} from "@/lib/workflows";

// استئناف خطوات "انتظار" + فحص محفّز "لا رد" — كل ٥ دقائق (انظر vercel.json)
// الحماية عبر: Authorization: Bearer ${CRON_SECRET}
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const resumed = await resumeWaitingWorkflowRuns();
  const noReplyFired = await runNoReplyWorkflows();
  return NextResponse.json({ resumed, noReplyFired });
}
