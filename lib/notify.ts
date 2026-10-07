import { prisma } from "@/lib/prisma";
import { createNotification, notifyWorkspaceMembers } from "@/lib/notifications";
import { sendPushToUser } from "@/lib/push";

type NotificationType = "ASSIGNED" | "BOOKING" | "MESSAGE" | "SYSTEM";

// إشعار لمستخدم محدد: إشعار داخلي في الجرس + Push للمتصفح (أفضل-جهد)
export async function notifyUser(opts: {
  workspaceId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  await createNotification(opts);
  sendPushToUser(opts.userId, {
    title: opts.title,
    body: opts.body,
    url: opts.link,
  }).catch(() => {});
}

// إشعار لكل أعضاء مساحة العمل: داخلي + Push، مع إمكان استبعاد منفّذ الفعل
export async function notifyMembers(opts: {
  workspaceId: string;
  excludeUserId?: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  await notifyWorkspaceMembers(opts.workspaceId, opts);
  try {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: opts.workspaceId },
      select: { userId: true },
    });
    for (const m of members) {
      if (m.userId === opts.excludeUserId) continue;
      sendPushToUser(m.userId, {
        title: opts.title,
        body: opts.body,
        url: opts.link,
      }).catch(() => {});
    }
  } catch (e) {
    console.error("[notify] تعذّر إرسال Push للأعضاء:", e);
  }
}
