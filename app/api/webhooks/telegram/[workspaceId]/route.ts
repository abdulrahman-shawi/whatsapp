import { handleIncomingTelegramMessage } from "@/lib/agent-engine";
import { getIntegration } from "@/lib/settings";
import {
  extractTelegramInboundMessage,
  verifyTelegramWebhookSecret,
} from "@/lib/telegram";

export const maxDuration = 60;

type Params = { params: { workspaceId: string } };

// مسار مستقل لكل مساحة عمل: لا يمكن لتحديث قناة أن يدخل صندوق وارد مساحة أخرى.
export async function POST(req: Request, { params }: Params) {
  const expectedSecret = await getIntegration(
    params.workspaceId,
    "TELEGRAM_WEBHOOK_SECRET"
  );
  if (!expectedSecret) {
    return Response.json({ error: "Telegram webhook is not configured" }, { status: 503 });
  }
  if (
    !verifyTelegramWebhookSecret(
      req.headers.get("x-telegram-bot-api-secret-token"),
      expectedSecret
    )
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return Response.json({ error: "Bad JSON" }, { status: 400 });

  const incoming = extractTelegramInboundMessage(payload);
  // نؤكد استلام الأحداث غير المدعومة حتى لا يعيد تيليجرام إرسالها بلا فائدة.
  if (!incoming) return Response.json({ ok: true });

  // ننتظر اكتمال التخزين والمعالجة قبل الرد؛ دوال serverless قد تتجمد بعد Response.
  await handleIncomingTelegramMessage({
    workspaceId: params.workspaceId,
    chatId: incoming.chatId,
    contactName: incoming.contactName,
    text: incoming.text,
  });

  return Response.json({ ok: true });
}
