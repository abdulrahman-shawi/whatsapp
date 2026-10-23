import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { triggerConversationUpdated } from "@/lib/pusher";

export async function escalateCriticalConversation(
  workspaceId: string,
  conversationId: string
): Promise<void> {
  const owners = await prisma.workspaceMember.findMany({
    where: { workspaceId, role: "OWNER" },
    select: { userId: true },
  });

  const escalated = await prisma.$transaction(async (tx) => {
    const updated = await tx.conversation.updateMany({
      where: { id: conversationId, workspaceId, isCritical: false },
      data: { isCritical: true, criticalAt: new Date(), status: "HANDED_OFF" },
    });
    if (updated.count === 0) return false;

    if (owners.length > 0) {
      await tx.conversationAssignee.createMany({
        data: owners.map(({ userId }) => ({ conversationId, userId })),
        skipDuplicates: true,
      });
    } else {
      console.warn(
        `[critical] لا يوجد مالك لمساحة العمل ${workspaceId} لإسناد المحادثة الحرجة ${conversationId}`
      );
    }
    return true;
  });

  if (!escalated) return;

  const settled = await Promise.allSettled(
    owners.map(({ userId }) =>
      notifyUser({
        workspaceId,
        userId,
        type: "SYSTEM",
        title: "محادثة حرجة تحتاج تدخلك",
        body: "تم رصد لغة حرجة في رسالة العميل وإسناد المحادثة إليك تلقائياً.",
        link: `/inbox?c=${conversationId}`,
      })
    )
  );
  for (const result of settled) {
    if (result.status === "rejected") {
      console.error("[critical] تعذّر إرسال تنبيه للمالك:", result.reason);
    }
  }
  triggerConversationUpdated(workspaceId, conversationId);
}
