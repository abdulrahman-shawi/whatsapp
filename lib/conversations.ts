import { prisma } from "@/lib/prisma";
import { resolveWhatsAppCreds, sendWhatsAppMessage, getLastWhatsAppError } from "@/lib/whatsapp";
import { triggerNewMessage, triggerConversationUpdated } from "@/lib/pusher";

// فلتر الإسناد: الكل / محادثاتي / غير المسندة
export type AssignmentFilter = "all" | "mine" | "unassigned";

type ListOptions = {
  archived?: boolean; // عرض المؤرشفة بدل الوارد
  closed?: boolean; // عرض المغلقة بدل الوارد
  followups?: boolean; // عرض محادثات لها موعد متابعة (الأقرب موعداً أولاً)
  filter?: AssignmentFilter;
  userId?: string; // مطلوب عند filter=mine
};

// جلب محادثات مساحة العمل مع جهة الاتصال وآخر رسالة وعدد غير المقروء
// الوارد الافتراضي: المفتوحة (غير المغلقة) وغير المؤرشفة
export async function getWorkspaceConversations(
  workspaceId: string,
  options: ListOptions = {}
) {
  const { archived = false, closed = false, followups = false, filter = "all", userId } = options;

  const where = {
    workspaceId,
    ...(followups
      ? { isArchived: false, closedAt: null, followUpAt: { not: null } }
      : archived
        ? { isArchived: true }
        : closed
          ? { isArchived: false, closedAt: { not: null } }
          : { isArchived: false, closedAt: null }),
    ...(filter === "mine" && userId
      ? { assignees: { some: { userId } } }
      : filter === "unassigned"
        ? { assignees: { none: {} } }
        : {}),
  };

  const conversations = await prisma.conversation.findMany({
    where,
    // قائمة المتابعات تُرتَّب بموعد المتابعة؛ غير ذلك الأحدث رسالة أولاً
    orderBy: followups
      ? [{ followUpAt: "asc" }]
      : [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          waPhone: true,
          tags: true,
          notes: true,
          stage: true,
        },
      },
      assignees: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { assignedAt: "asc" },
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
    // الموظفون المسند إليهم المحادثة (قد يكون أكثر من واحد)
    assignees: c.assignees.map((a) => a.user),
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
    followUpAt: c.followUpAt ? c.followUpAt.toISOString() : null,
    tags: c.tags,
    notes: c.notes,
    csatRating: c.csatRating,
    sentiment: c.sentiment,
    summary: c.summary,
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

// إرسال الرسائل المجدولة التي حان موعدها — تُستدعى من كرون كل ٥ دقائق
// لكل رسالة: إرسال فعلي عبر مزود واتساب + حفظ نسخة في المحادثة + تعليمها مُرسلة
// عند الفشل: نؤجل ٥ دقائق ونسجّل السبب — وبعد ٥ محاولات نتوقف عن إعادة المحاولة
export async function sendDueScheduledMessages(): Promise<{
  sent: number;
  failed: number;
  gaveUp: number;
}> {
  const due = await prisma.scheduledMessage.findMany({
    where: { sentAt: null, sendAt: { lte: new Date() } },
    take: 50,
    include: {
      conversation: { include: { contact: { select: { waPhone: true } } } },
    },
  });
  if (due.length === 0) return { sent: 0, failed: 0, gaveUp: 0 };

  let sent = 0;
  let failed = 0;
  let gaveUp = 0;
  for (const item of due) {
    try {
      const creds = await resolveWhatsAppCreds(item.workspaceId);
      if (!creds) throw new Error("لا يوجد مزود واتساب مُعدّ");
      const ok = await sendWhatsAppMessage(
        item.conversation.contact.waPhone,
        item.body,
        creds
      );
      if (!ok) {
        const detail = getLastWhatsAppError();
        throw new Error("فشل الإرسال عبر المزود" + (detail ? ` — ${detail}` : ""));
      }

      const message = await prisma.message.create({
        data: {
          conversationId: item.conversationId,
          direction: "OUTBOUND",
          senderType: "HUMAN",
          body: item.body,
        },
      });
      await prisma.conversation.update({
        where: { id: item.conversationId },
        data: { lastMessageAt: new Date() },
      });
      await prisma.scheduledMessage.update({
        where: { id: item.id },
        data: { sentAt: new Date() },
      });
      // عدّاد الرسائل الشهري — نفس منطق الوارد
      const month = new Date().toISOString().slice(0, 7);
      await prisma.usageRecord.upsert({
        where: { workspaceId_month: { workspaceId: item.workspaceId, month } },
        update: { messagesUsed: { increment: 1 } },
        create: { workspaceId: item.workspaceId, month, messagesUsed: 1 },
      });
      triggerNewMessage(item.workspaceId, item.conversationId, {
        ...message,
        createdAt: message.createdAt.toISOString(),
        senderName: null,
      });
      triggerConversationUpdated(item.workspaceId, item.conversationId);
      sent++;
    } catch (e) {
      const reason = e instanceof Error ? e.message.slice(0, 300) : "خطأ غير معروف";
      console.error("[scheduled] فشل إرسال رسالة مجدولة:", reason);
      const attempts = item.attempts + 1;
      // بعد ٥ محاولات نتوقف عن التأجيل التلقائي — تبقى في القائمة بسبب الفشل المعروض
      const reschedule = attempts < 5;
      await prisma.scheduledMessage
        .update({
          where: { id: item.id },
          data: {
            attempts,
            lastError: reason,
            ...(reschedule ? { sendAt: new Date(Date.now() + 5 * 60 * 1000) } : {}),
          },
        })
        .catch(() => {});
      if (reschedule) failed++;
      else gaveUp++;
    }
  }
  return { sent, failed, gaveUp };
}
