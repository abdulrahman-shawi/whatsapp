import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractTelegramInboundMessage,
  sendTelegramMessage,
  setTelegramWebhook,
  telegramChatId,
  verifyTelegramWebhookSecret,
} from "@/lib/telegram";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Telegram inbound updates", () => {
  it("extracts a namespaced contact identity and sender name", () => {
    expect(
      extractTelegramInboundMessage({
        update_id: 10,
        message: {
          message_id: 20,
          from: { id: 7, first_name: "سارة", last_name: "أحمد" },
          chat: { id: 123456, type: "private" },
          text: "مرحباً",
        },
      })
    ).toEqual({
      chatId: "123456",
      waPhone: "telegram:123456",
      contactName: "سارة أحمد",
      text: "مرحباً",
    });
  });

  it("supports group chat IDs and ignores bot or edited messages", () => {
    expect(
      extractTelegramInboundMessage({
        message: {
          from: { id: 7, first_name: "Ali" },
          chat: { id: -1001234567890 },
          photo: [{ file_id: "photo" }],
        },
      })
    ).toMatchObject({
      chatId: "-1001234567890",
      waPhone: "telegram:-1001234567890",
      text: "[صورة]",
    });
    expect(
      extractTelegramInboundMessage({
        edited_message: { chat: { id: 123 }, text: "تعديل" },
      })
    ).toBeNull();
    expect(
      extractTelegramInboundMessage({
        message: {
          from: { id: 8, is_bot: true },
          chat: { id: 123 },
          text: "bot",
        },
      })
    ).toBeNull();
  });
});

describe("Telegram webhook security", () => {
  it("accepts only the exact secret", () => {
    expect(verifyTelegramWebhookSecret("secret-value", "secret-value")).toBe(true);
    expect(verifyTelegramWebhookSecret("wrong", "secret-value")).toBe(false);
    expect(verifyTelegramWebhookSecret(null, "secret-value")).toBe(false);
    expect(verifyTelegramWebhookSecret("secret-value", "")).toBe(false);
  });
});

describe("Telegram Bot API", () => {
  it("registers a message-only webhook with its secret header value", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      setTelegramWebhook({
        token: "123:secret-token",
        url: "https://app.example.com/api/webhooks/telegram/workspace-a",
        secret: "webhook-secret",
      })
    ).resolves.toBe(true);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:secret-token/setWebhook");
    expect(JSON.parse(options.body)).toEqual({
      url: "https://app.example.com/api/webhooks/telegram/workspace-a",
      secret_token: "webhook-secret",
      allowed_updates: ["message"],
    });
  });

  it("sends manual and automatic replies as plain Telegram messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ ok: true, result: { message_id: 1 } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendTelegramMessage("123456", "أهلاً بك", "123:secret-token")
    ).resolves.toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      chat_id: "123456",
      text: "أهلاً بك",
    });
  });

  it("splits replies longer than Telegram's text limit", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({ ok: true, result: { message_id: 1 } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendTelegramMessage("123456", "أ".repeat(4200), "123:secret-token")
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns false instead of losing the stored reply on API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ ok: false, description: "chat not found" }, { status: 400 })
      )
    );
    await expect(
      sendTelegramMessage("123456", "اختبار", "123:secret-token")
    ).resolves.toBe(false);
  });

  it("extracts only valid namespaced Telegram chat IDs", () => {
    expect(telegramChatId("telegram:-100123")).toBe("-100123");
    expect(telegramChatId("966500000000")).toBeNull();
    expect(telegramChatId("telegram:123;drop")).toBeNull();
  });
});
