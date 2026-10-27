import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  contactFindFirst: vi.fn(),
  contactUpsert: vi.fn(),
  agentFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationUpdate: vi.fn(),
  usageUpsert: vi.fn(),
  triggerWorkflows: vi.fn(),
  triggerNewMessage: vi.fn(),
  triggerConversationUpdated: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findUnique: mocks.messageFindUnique,
      create: mocks.messageCreate,
    },
    contact: {
      findFirst: mocks.contactFindFirst,
      upsert: mocks.contactUpsert,
    },
    agent: { findFirst: mocks.agentFindFirst },
    conversation: {
      findFirst: mocks.conversationFindFirst,
      update: mocks.conversationUpdate,
    },
    usageRecord: { upsert: mocks.usageUpsert },
  },
}));
vi.mock("@/lib/pusher", () => ({
  triggerNewMessage: mocks.triggerNewMessage,
  triggerConversationUpdated: mocks.triggerConversationUpdated,
}));
vi.mock("@/lib/workflows", () => ({
  triggerWorkflows: mocks.triggerWorkflows,
  getWorkspaceBusinessHours: vi.fn(),
}));
vi.mock("@/lib/critical-conversations", () => ({
  escalateCriticalConversation: vi.fn(),
}));
vi.mock("@/lib/scoring", () => ({ recalculateLeadScore: vi.fn() }));
vi.mock("@/lib/outbound-webhooks", () => ({ fireOutboundEvent: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));

import { handleIncomingWhatsAppMessage } from "@/lib/agent-engine";

const input = {
  waPhone: "963900000000",
  contactName: null,
  text: "مرحباً",
  waMessageId: "wamid.inbound.1",
  workspaceId: "workspace-a",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.messageFindUnique.mockResolvedValue(null);
  mocks.contactFindFirst.mockResolvedValue(null);
  mocks.agentFindFirst.mockResolvedValue(null);
  mocks.contactUpsert.mockResolvedValue({
    id: "contact-a",
    workspaceId: "workspace-a",
    waPhone: input.waPhone,
    name: null,
    stage: "NEW",
    tags: [],
  });
  mocks.conversationFindFirst.mockResolvedValue({
    id: "conversation-a",
    csatPending: false,
    closedAt: null,
    topic: null,
  });
  mocks.messageCreate.mockResolvedValue({ id: "message-a" });
  mocks.conversationUpdate.mockResolvedValue({});
  mocks.usageUpsert.mockResolvedValue({});
  mocks.triggerWorkflows.mockResolvedValue(undefined);
});

describe("WhatsApp tenant isolation and idempotency", () => {
  it("looks up an active agent only inside the resolved workspace", async () => {
    await handleIncomingWhatsAppMessage(input);

    expect(mocks.agentFindFirst).toHaveBeenCalledWith({
      where: { isActive: true, workspaceId: "workspace-a" },
      include: { knowledgeSources: true },
    });
    expect(mocks.contactUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_waPhone: {
            workspaceId: "workspace-a",
            waPhone: input.waPhone,
          },
        },
      })
    );
  });

  it("scopes blocked-contact checks to the same workspace", async () => {
    mocks.contactFindFirst.mockResolvedValueOnce({ id: "blocked-a" });

    await handleIncomingWhatsAppMessage(input);

    expect(mocks.contactFindFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-a",
        waPhone: input.waPhone,
        blocked: true,
      },
      select: { id: true },
    });
    expect(mocks.agentFindFirst).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("returns before any tenant writes when the provider message is duplicate", async () => {
    mocks.messageFindUnique.mockResolvedValue({ id: "already-stored" });

    await handleIncomingWhatsAppMessage(input);

    expect(mocks.messageFindUnique).toHaveBeenCalledWith({
      where: { waMessageId: input.waMessageId },
      select: { id: true },
    });
    expect(mocks.contactFindFirst).not.toHaveBeenCalled();
    expect(mocks.agentFindFirst).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });
});
