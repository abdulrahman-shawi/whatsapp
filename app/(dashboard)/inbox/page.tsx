import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { getWorkspaceConversations } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { InboxClient } from "@/components/inbox/inbox-client";

// الصفحة ديناميكية دائماً — لا تخزين مؤقت لبيانات المحادثات
export const dynamic = "force-dynamic";

// صندوق الوارد: جلب أولي من الخادم ثم يدير العميل الاستطلاع
export default async function InboxPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const [conversations, memberships] = await Promise.all([
    getWorkspaceConversations(ctx.workspaceId),
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const members = memberships.map((m) => m.user);
  return (
    <InboxClient
      initialConversations={conversations}
      members={members}
      currentUserId={ctx.userId}
    />
  );
}
