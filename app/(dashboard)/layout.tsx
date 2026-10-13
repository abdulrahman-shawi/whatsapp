import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/session";
import { getThemeCssVars } from "@/lib/theme";
import { DashboardShell } from "@/components/dashboard-shell";

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

  // لون العلامة لمساحة العمل — يُحقن كمتغيرات CSS على الجذر فتكتسبه الواجهة كلها
  const themeVars = await getThemeCssVars(ctx.workspaceId);

  return (
    <div style={themeVars as React.CSSProperties}>
      <DashboardShell
        workspaceName={membership?.workspace.name ?? "مساحة العمل"}
        workspaceId={ctx.workspaceId}
        userEmail={session.user.email ?? ""}
        role={ctx.role}
      >
        {children}
      </DashboardShell>
    </div>
  );
}
