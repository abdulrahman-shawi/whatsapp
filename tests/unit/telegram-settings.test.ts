import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getWorkspaceContextMock,
  getIntegrationMock,
  getIntegrationListMock,
  upsertMock,
  getTelegramBotMock,
  getTelegramWebhookInfoMock,
  setTelegramWebhookMock,
} = vi.hoisted(() => ({
  getWorkspaceContextMock: vi.fn(),
  getIntegrationMock: vi.fn(),
  getIntegrationListMock: vi.fn(),
  upsertMock: vi.fn(),
  getTelegramBotMock: vi.fn(),
  getTelegramWebhookInfoMock: vi.fn(),
  setTelegramWebhookMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getWorkspaceContext: getWorkspaceContextMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { setting: { upsert: upsertMock } },
}));
vi.mock("@/lib/settings", () => ({
  getIntegration: getIntegrationMock,
  getIntegrationList: getIntegrationListMock,
}));
vi.mock("@/lib/telegram", () => ({
  getTelegramBot: getTelegramBotMock,
  getTelegramWebhookInfo: getTelegramWebhookInfoMock,
  setTelegramWebhook: setTelegramWebhookMock,
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { GET, POST } from "@/app/api/settings/integrations/telegram/route";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
let storedSecret: string | null;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  storedSecret = "workspace-secret";
  getWorkspaceContextMock.mockResolvedValue({
    workspaceId: "workspace-a",
    userId: "user-a",
    role: "OWNER",
  });
  getIntegrationMock.mockImplementation(async (_workspaceId: string, key: string) => {
    if (key === "TELEGRAM_BOT_TOKEN") return "telegram-token";
    if (key === "TELEGRAM_WEBHOOK_SECRET") return storedSecret;
    return null;
  });
  getIntegrationListMock.mockResolvedValue([]);
  getTelegramBotMock.mockResolvedValue({
    id: 1,
    is_bot: true,
    first_name: "Store bot",
    username: "store_bot",
  });
  setTelegramWebhookMock.mockResolvedValue(true);
  upsertMock.mockResolvedValue({});
});

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe("Telegram channel connection settings", () => {
  it("validates the bot and registers the workspace-scoped webhook", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/settings/integrations/telegram", {
        method: "POST",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getTelegramBotMock).toHaveBeenCalledWith("telegram-token");
    expect(setTelegramWebhookMock).toHaveBeenCalledWith({
      token: "telegram-token",
      url: "https://app.example.com/api/webhooks/telegram/workspace-a",
      secret: "workspace-secret",
    });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(data.connection).toMatchObject({
      connected: true,
      username: "store_bot",
    });
  });

  it("generates and stores a strong secret when the optional field is blank", async () => {
    storedSecret = null;
    const response = await POST(
      new Request("https://app.example.com/api/settings/integrations/telegram", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledOnce();
    const generated = setTelegramWebhookMock.mock.calls[0][0].secret;
    expect(generated).toMatch(/^[a-f0-9]{64}$/);
    expect(upsertMock.mock.calls[0][0].create.value).toBe(generated);
  });

  it("reports a real connection only when Telegram points to this workspace", async () => {
    getTelegramWebhookInfoMock.mockResolvedValue({
      url: "https://app.example.com/api/webhooks/telegram/workspace-a",
      pending_update_count: 2,
    });
    const response = await GET(
      new Request("https://app.example.com/api/settings/integrations/telegram")
    );
    const data = await response.json();

    expect(data.connection).toMatchObject({
      configured: true,
      connected: true,
      pendingUpdates: 2,
    });
  });
});
