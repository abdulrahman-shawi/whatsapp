import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { getWorkspaceConversations } from "@/lib/conversations";
import { InboxClient } from "@/components/inbox/inbox-client";

// الصفحة ديناميكية دائماً — لا تخزين مؤقت لبيانات المحادثات
export const dynamic = "force-dynamic";

// صندوق الوارد: جلب أولي من الخادم ثم يدير العميل الاستطلاع
export default async function InboxPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const conversations = await getWorkspaceConversations(ctx.workspaceId, false);
  return <InboxClient initialConversations={conversations} />;
}
