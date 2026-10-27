import { NextResponse } from "next/server";
import { processWebhookQueue } from "@/lib/webhook-queue";
import { processStoredWebhookEvent } from "@/lib/webhook-processing";

export const maxDuration = 60;

// عامل الطابور الدائم — يمكن استدعاؤه من Vercel Cron أو عامل خارجي آمن.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const result = await processWebhookQueue(processStoredWebhookEvent, 10);
  return NextResponse.json(result);
}
