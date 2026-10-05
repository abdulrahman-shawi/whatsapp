import { prisma } from "@/lib/prisma";

// فلتر الإسناد: الكل / محادثاتي / غير المسندة
export type AssignmentFilter = "all" | "mine" | "unassigned";

type ListOptions = {
  archived?: boolean; // عرض المؤرشفة بدل الوارد
  closed?: boolean; // عرض المغلقة بدل الوارد
  filter?: AssignmentFilter;
  userId?: string; // مطلوب عند filter=mine
};

// جلب محادثات مساحة العمل مع جهة الاتصال وآخر رسالة وعدد غير المقروء
// الوارد الافتراضي: المفتوحة (غير المغلقة) وغير المؤرشفة
export async function getWorkspaceConversations(
  workspaceId: string,
  options: ListOptions = {}
) {
  const { archived = false, closed = false, filter = "all", userId } = options;

  const where = {
    workspaceId,
    ...(archived
      ? { isArchived: true }
      : closed
        ? { isArchived: false, closedAt: { not: null } }
        : { isArchived: false, closedAt: null }),
    ...(filter === "mine" && userId
      ? { assignedToId: userId }
      : filter === "unassigned"
        ? { assignedToId: null }
        : {}),
  };

  const conversations = await prisma.conversation.findMany({
    where,
    // الأحدث أولاً، والمحادثات بلا رسائل في الأسفل
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
    include: {
      contact: {
        select: { id: true, name: true, waPhone: true, tags: true, notes: true },
      },
      assignedTo: { select: { id: true, name: true } },
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
    assignedTo: c.assignedTo,
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
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
