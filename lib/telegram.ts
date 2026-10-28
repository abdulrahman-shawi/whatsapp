import { createHash, timingSafeEqual } from "node:crypto";

const TELEGRAM_API_ROOT = "https://api.telegram.org";
const TELEGRAM_TEXT_LIMIT = 4096;

export type TelegramBot = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type TelegramWebhookInfo = {
  url: string;
  pending_update_count?: number;
  last_error_message?: string;
  last_error_date?: number;
};

export type TelegramInboundMessage = {
  chatId: string;
  waPhone: string;
  contactName: string | null;
  text: string;
};

type TelegramApiResponse<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
};

// لا نُدرج التوكن في أي خطأ ظاهر للمستخدم أو في سجلات التطبيق.
function safeTelegramError(error: unknown, token: string): string {
  const raw = error instanceof Error ? error.message : "خطأ غير معروف";
  return raw.replaceAll(token, "[مخفي]").slice(0, 300);
}

async function callTelegramApi<T>(
  token: string,
  method: "getMe" | "setWebhook" | "getWebhookInfo" | "sendMessage",
  payload?: Record<string, unknown>
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API_ROOT}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new Error(`تعذّر الاتصال بتيليجرام: ${safeTelegramError(error, token)}`);
  }

  const data = (await response.json().catch(() => null)) as TelegramApiResponse<T> | null;
  if (!response.ok || data?.ok !== true || data.result === undefined) {
    const detail = data?.description
      ? `: ${data.description.replaceAll(token, "[مخفي]").slice(0, 240)}`
      : "";
    throw new Error(`رفض تيليجرام الطلب (HTTP ${response.status})${detail}`);
  }
  return data.result;
}

export async function getTelegramBot(token: string): Promise<TelegramBot> {
  return callTelegramApi<TelegramBot>(token, "getMe");
}

export async function setTelegramWebhook(input: {
  token: string;
  url: string;
  secret: string;
}): Promise<boolean> {
  return callTelegramApi<boolean>(input.token, "setWebhook", {
    url: input.url,
    secret_token: input.secret,
    allowed_updates: ["message"],
  });
}

export async function getTelegramWebhookInfo(
  token: string
): Promise<TelegramWebhookInfo> {
  return callTelegramApi<TelegramWebhookInfo>(token, "getWebhookInfo");
}

function splitTelegramText(text: string): string[] {
  if (text.length <= TELEGRAM_TEXT_LIMIT) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > TELEGRAM_TEXT_LIMIT) {
    let end = rest.lastIndexOf("\n", TELEGRAM_TEXT_LIMIT);
    if (end < TELEGRAM_TEXT_LIMIT / 2) end = TELEGRAM_TEXT_LIMIT;
    // لا نقسم زوجاً surrogate بين رسالتين.
    if (/[\uD800-\uDBFF]/.test(rest[end - 1] ?? "")) end -= 1;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// الإرسال اليدوي والآلي يستخدمان هذا المسار نفسه. الفشل يعيد false ولا يمنع حفظ الرسالة.
export async function sendTelegramMessage(
  chatId: string,
  body: string,
  token: string | null
): Promise<boolean> {
  if (!token || !/^-?\d+$/.test(chatId) || !body.trim()) return false;
  try {
    for (const text of splitTelegramText(body)) {
      await callTelegramApi<unknown>(token, "sendMessage", {
        chat_id: chatId,
        text,
      });
    }
    return true;
  } catch {
    return false;
  }
}

export function telegramChatId(contactKey: string): string | null {
  const match = /^telegram:(-?\d+)$/.exec(contactKey);
  return match?.[1] ?? null;
}

// مقارنة ثابتة الزمن، وتعمل أيضاً عندما يختلف طول السرّين.
export function verifyTelegramWebhookSecret(
  received: string | null,
  expected: string
): boolean {
  if (!received || !expected) return false;
  const receivedHash = createHash("sha256").update(received).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

function messagePlaceholder(message: Record<string, unknown>): string {
  if (Array.isArray(message.photo)) return "[صورة]";
  if (message.video) return "[مقطع فيديو]";
  if (message.audio || message.voice) return "[رسالة صوتية]";
  if (message.document) return "[مستند]";
  if (message.sticker) return "[ملصق]";
  if (message.animation) return "[صورة متحركة]";
  if (message.location) return "[موقع]";
  if (message.contact) return "[جهة اتصال]";
  if (message.video_note) return "[رسالة فيديو]";
  return "[رسالة تيليجرام]";
}

// يستخرج الرسائل الجديدة فقط؛ التعديلات والأحداث الأخرى لا تنشئ رسائل مكررة في الوارد.
export function extractTelegramInboundMessage(
  payload: unknown
): TelegramInboundMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const message = (payload as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;

  const value = message as Record<string, unknown>;
  const chat = value.chat as { id?: number | string } | undefined;
  const from = value.from as
    | {
        is_bot?: boolean;
        first_name?: string;
        last_name?: string;
        username?: string;
      }
    | undefined;
  if (
    from?.is_bot ||
    (typeof chat?.id !== "number" && typeof chat?.id !== "string") ||
    (typeof chat.id === "number" && !Number.isFinite(chat.id))
  ) {
    return null;
  }

  const chatId = String(chat.id);
  if (!/^-?\d+$/.test(chatId)) return null;
  const text =
    (typeof value.text === "string" && value.text.trim()) ||
    (typeof value.caption === "string" && value.caption.trim()) ||
    messagePlaceholder(value);
  const fullName = [from?.first_name, from?.last_name]
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
    .join(" ")
    .trim();
  const contactName = fullName || (from?.username ? `@${from.username}` : null);

  return {
    chatId,
    waPhone: `telegram:${chatId}`,
    contactName,
    text,
  };
}
