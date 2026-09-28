import { prisma } from "@/lib/prisma";

// جلب محادثات مساحة العمل مع جهة الاتصال وآخر رسالة وعدد غير المقروء
export async function getWorkspaceConversations(
  workspaceId: string,
  archived: boolean
) {
  const conversations = await prisma.conversation.findMany({
    where: { workspaceId, isArchived: archived },
    // الأحدث أولاً، والمحادثات بلا رسائل في الأسفل
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
    include: {
      contact: {
        select: { id: true, name: true, waPhone: true, tags: true, notes: true },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          messages: { where: { direction: "INBOUND", isRead: false } },
        },
      },
    },
  });

  // تحويل التواريخ إلى نصوص لتمريرها بأمان للعميل
  return conversations.map((c) => ({
    id: c.id,
    workspaceId: c.workspaceId,
    status: c.status,
    platform: c.platform,
    isArchived: c.isArchived,
    agentId: c.agentId,
    lastMessageAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
    contact: c.contact,
    lastMessage: c.messages[0]
      ? {
          body: c.messages[0].body,
          direction: c.messages[0].direction,
          createdAt: c.messages[0].createdAt.toISOString(),
        }
      : null,
    unreadCount: c._count.messages,
  }));
}

export type ConversationListItem = Awaited<
  ReturnType<typeof getWorkspaceConversations>
>[number];
