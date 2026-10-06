import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/session";
import { SidebarNav } from "@/components/sidebar-nav";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { LogoutButton } from "@/components/logout-button";

// هيكل لوحة التحكم: يتطلب جلسة، ويعرض شريطاً جانبياً (يمين في RTL)
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // مساحة العمل الحالية (حسب كوكي "ws") مع دور المستخدم فيها
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, workspaceId: ctx.workspaceId },
    include: { workspace: true },
  });

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-l bg-card p-4">
        <div className="mb-6 px-2">
          <h1 className="text-lg font-bold text-primary">ردّ</h1>
          <p className="truncate text-sm text-muted-foreground">
            {membership?.workspace.name ?? "مساحة العمل"}
          </p>
        </div>
        <WorkspaceSwitcher currentWorkspaceId={ctx.workspaceId} />
        <div className="flex-1">
          <SidebarNav role={ctx.role} />
        </div>
        <div className="border-t pt-3">
          <p className="mb-2 truncate px-3 text-xs text-muted-foreground">
            {session.user.email}
          </p>
          <LogoutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
