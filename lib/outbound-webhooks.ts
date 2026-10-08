import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

const WEBHOOK_TIMEOUT_MS = 8000;
const USER_AGENT = "Flovoo-Webhook";

// إطلاق حدث صادر لكل الويب هوكات النشطة المشتركة فيه — نار-ونسيان:
// لا تُنتظر من نادِيها ولا ترمي أخطاءً أبداً
export function fireOutboundEvent(
  workspaceId: string,
  event: string,
  payload: Record<string, unknown>
): void {
  void deliverEvent(workspaceId, event, payload).catch(() => {});
}

async function deliverEvent(
  workspaceId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  let hooks;
  try {
    hooks = await prisma.outboundWebhook.findMany({
      where: {
        workspaceId,
        isActive: true,
        events: { has: event },
      },
    });
  } catch (e) {
    console.error(`[outbound-webhooks] تعذّر جلب الاشتراكات لحدث ${event}:`, e);
    return;
  }
  if (hooks.length === 0) return;

  const body = JSON.stringify({
    event,
    firedAt: new Date().toISOString(),
    data: payload,
  });

  for (const hook of hooks) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    let status = 0;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Flovoo-Event": event,
        "User-Agent": USER_AGENT,
      };
      if (hook.secret) {
        headers["X-Flovoo-Signature"] = createHmac("sha256", hook.secret)
          .update(body)
          .digest("hex");
      }
      const res = await fetch(hook.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      status = res.status;
    } catch (e) {
      status = 0;
      console.error(
        `[outbound-webhooks] فشل إرسال ${event} إلى ${hook.url}:`,
        e
      );
    } finally {
      clearTimeout(timer);
    }
    try {
      await prisma.outboundWebhook.update({
        where: { id: hook.id },
        data: { lastFiredAt: new Date(), lastStatus: status },
      });
    } catch (e) {
      console.error(
        `[outbound-webhooks] تعذّر تحديث حالة الويب هوك ${hook.id}:`,
        e
      );
    }
  }
}
