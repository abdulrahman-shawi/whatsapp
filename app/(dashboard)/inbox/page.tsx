import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { getWorkspaceConversations } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { InboxClient } from "@/components/inbox/inbox-client";

// الصفحة ديناميكية دائماً — لا تخزين مؤقت لبيانات المحادثات
export const dynamic = "force-dynamic";

// صندوق الوارد: جلب أولي من الخادم ثم يدير العميل الاستطلاع
// ‎?c=<id> يفتح محادثة محددة مباشرة (تستخدمه روابط إشعارات المتابعات)
export default async function InboxPage({
  searchParams,
}: {
  searchParams: { c?: string };
}) {
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
  const initialSelectedId = searchParams.c ?? null;
  return (
    <InboxClient
      initialConversations={conversations}
      members={members}
      currentUserId={ctx.userId}
      initialSelectedId={initialSelectedId}
    />
  );
}
