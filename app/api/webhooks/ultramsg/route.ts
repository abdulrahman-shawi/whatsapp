import { createHash } from "node:crypto";
import { resolveWorkspaceByUltraMsgInstance } from "@/lib/settings";
import { enqueueWebhookEvent } from "@/lib/webhook-queue";

export const maxDuration = 60;

export async function POST(req: Request) {
  const rawBody = await req.text();
  let payload: {
    event_type?: string;
    data?: {
      id?: string;
      from?: string;
      fromMe?: boolean | string;
    };
  } | null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!payload) return new Response("Bad JSON", { status: 400 });

  if (payload.event_type !== "message_received") {
    return new Response("OK", { status: 200 });
  }

  const data = payload.data ?? {};
  const fromMe = data.fromMe === true || data.fromMe === "true";
  const waPhone = data.from?.replace("@c.us", "") ?? "";
  if (fromMe || !waPhone) return new Response("OK", { status: 200 });

  const instanceId = new URL(req.url).searchParams.get("instanceId");
  const workspaceId = instanceId
    ? await resolveWorkspaceByUltraMsgInstance(instanceId)
    : null;
  const externalId = data.id ??
    createHash("sha256").update(rawBody).digest("hex");

  try {
    await enqueueWebhookEvent({
      provider: "ULTRAMSG",
      externalId: `message:${externalId}`,
      workspaceId,
      payload: { instanceId, externalId, data: JSON.parse(rawBody).data },
    });
  } catch (error) {
    console.error("[ultramsg-webhook] تعذر حفظ الحدث في الطابور:", error);
    return new Response("Queue unavailable", { status: 503 });
  }

  return new Response("OK", { status: 200 });
}
