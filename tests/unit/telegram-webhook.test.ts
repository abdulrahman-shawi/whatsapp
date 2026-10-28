import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleIncomingMock, getIntegrationMock } = vi.hoisted(() => ({
  handleIncomingMock: vi.fn(),
  getIntegrationMock: vi.fn(),
}));

vi.mock("@/lib/agent-engine", () => ({
  handleIncomingTelegramMessage: handleIncomingMock,
}));
vi.mock("@/lib/settings", () => ({
  getIntegration: getIntegrationMock,
}));

import { POST } from "@/app/api/webhooks/telegram/[workspaceId]/route";

function updatePayload(text = "مرحباً") {
  return {
    update_id: 100,
    message: {
      message_id: 200,
      from: { id: 9, first_name: "محمد" },
      chat: { id: 456789, type: "private" },
      text,
    },
  };
}

function request(secret: string | null, payload: unknown = updatePayload()) {
  return new Request(
    "https://app.example.com/api/webhooks/telegram/workspace-a",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  handleIncomingMock.mockResolvedValue(undefined);
  getIntegrationMock.mockImplementation(async (workspaceId: string, key: string) => {
    if (key === "TELEGRAM_WEBHOOK_SECRET") return `secret-for-${workspaceId}`;
    return null;
  });
});

describe("POST /api/webhooks/telegram/[workspaceId]", () => {
  it("rejects an invalid secret before parsing or storing the message", async () => {
    const response = await POST(request("wrong-secret"), {
      params: { workspaceId: "workspace-a" },
    });

    expect(response.status).toBe(401);
    expect(handleIncomingMock).not.toHaveBeenCalled();
  });

  it("stores a valid update in the workspace named by the route", async () => {
    const response = await POST(request("secret-for-workspace-a"), {
      params: { workspaceId: "workspace-a" },
    });

    expect(response.status).toBe(200);
    expect(handleIncomingMock).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      chatId: "456789",
      contactName: "محمد",
      text: "مرحباً",
    });
  });

  it("does not accept another workspace's webhook secret", async () => {
    const response = await POST(request("secret-for-workspace-b"), {
      params: { workspaceId: "workspace-a" },
    });

    expect(response.status).toBe(401);
    expect(handleIncomingMock).not.toHaveBeenCalled();
  });

  it("acknowledges unsupported update types without creating inbox messages", async () => {
    const response = await POST(
      request("secret-for-workspace-a", {
        update_id: 101,
        edited_message: updatePayload("تعديل").message,
      }),
      { params: { workspaceId: "workspace-a" } }
    );

    expect(response.status).toBe(200);
    expect(handleIncomingMock).not.toHaveBeenCalled();
  });

  it("fails closed when the workspace has no webhook secret", async () => {
    getIntegrationMock.mockResolvedValue(null);
    const response = await POST(request("anything"), {
      params: { workspaceId: "workspace-a" },
    });

    expect(response.status).toBe(503);
    expect(handleIncomingMock).not.toHaveBeenCalled();
  });
});
