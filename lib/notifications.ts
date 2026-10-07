import { prisma } from "@/lib/prisma";

// إشعار داخلي لعضو فريق — userId فارغ يعني "لكل أعضاء مساحة العمل"
export async function createNotification(opts: {
  workspaceId: string;
  userId?: string | null;
  type: "ASSIGNED" | "BOOKING" | "MESSAGE" | "SYSTEM";
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        workspaceId: opts.workspaceId,
        userId: opts.userId ?? null,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        link: opts.link ?? null,
      },
    });
  } catch (e) {
    console.error("[notifications] تعذر إنشاء الإشعار:", e);
  }
}

// إشعار لكل أعضاء مساحة العمل (يمكن استبعاد منفّذ الفعل نفسه)
export async function notifyWorkspaceMembers(
  workspaceId: string,
  opts: {
    type: "ASSIGNED" | "BOOKING" | "MESSAGE" | "SYSTEM";
    title: string;
    body: string;
    link?: string | null;
    excludeUserId?: string;
  }
): Promise<void> {
  try {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true },
    });
    await prisma.notification.createMany({
      data: members
        .filter((m) => m.userId !== opts.excludeUserId)
        .map((m) => ({
          workspaceId,
          userId: m.userId,
          type: opts.type,
          title: opts.title,
          body: opts.body,
          link: opts.link ?? null,
        })),
    });
  } catch (e) {
    console.error("[notifications] تعذر إشعار الأعضاء:", e);
  }
}
