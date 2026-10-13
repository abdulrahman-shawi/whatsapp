"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, MessageCircleMore, X } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { LogoutButton } from "@/components/logout-button";
import { RemindersBell } from "@/components/reminders-bell";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PwaSetup } from "@/components/pwa/pwa-setup";

// عناوين الصفحات في الترويسة
const TITLES: [string, string][] = [
  ["/inbox", "الوارد"],
  ["/contacts", "العملاء"],
  ["/bookings", "الحجوزات"],
  ["/broadcast", "الحملات"],
  ["/forms", "نماذج العملاء"],
  ["/audit", "سجل التدقيق"],
  ["/workflows", "سير العمل"],
  ["/agents", "الوكلاء"],
  ["/widget", "الويدجت"],
  ["/reports", "التقارير"],
  ["/admin", "لوحة المنصة"],
  ["/settings", "الإعدادات"],
];

function Logo({ workspaceName }: { workspaceName: string }) {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-mint text-navy shadow-[0_6px_20px_-4px_rgba(6,214,160,0.5)]">
        <MessageCircleMore className="size-5" strokeWidth={2.4} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-lg font-black text-white">رَدّ</span>
        <span className="block truncate text-[11px] font-medium text-white/40">
          {workspaceName}
        </span>
      </span>
    </div>
  );
}

type Props = {
  workspaceName: string;
  workspaceId: string;
  userEmail: string;
  role: "OWNER" | "STAFF";
  children: React.ReactNode;
};

// هيكل لوحة التحكم: شريط جانبي كحلي (يمين في RTL) + ترويسة لاصقة + درج للجوال
export function DashboardShell({
  workspaceName,
  workspaceId,
  userEmail,
  role,
  children,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const title =
    TITLES.find(([href]) => pathname === href || pathname.startsWith(href + "/"))?.[1] ??
    "رَدّ";

  const sidebarBody = (
    <>
      <div className="px-4 pb-5 pt-6">
        <Logo workspaceName={workspaceName} />
      </div>
      <div className="px-3 pb-3">
        <WorkspaceSwitcher currentWorkspaceId={workspaceId} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <SidebarNav role={role} onNavigate={() => setMenuOpen(false)} />
      </div>
      <div className="border-t border-white/[0.07] p-4">
        <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.05] p-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint-soft text-xs font-black text-mint-dark">
            {userEmail?.[0]?.toUpperCase() ?? "؟"}
          </span>
          <p className="min-w-0 flex-1 truncate text-[11px] font-bold text-white/70" dir="ltr">
            {userEmail}
          </p>
          <LogoutButton />
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-background">
      {/* الشريط الجانبي — سطح المكتب */}
      <aside className="fixed inset-y-0 right-0 z-40 hidden w-[264px] flex-col bg-navy lg:flex">
        {sidebarBody}
      </aside>

      {/* درج الجوال */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-[290px] flex-col bg-navy shadow-2xl">
            <button
              className="absolute left-3 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white"
              onClick={() => setMenuOpen(false)}
              aria-label="إغلاق القائمة"
            >
              <X className="size-5" />
            </button>
            {sidebarBody}
          </aside>
        </div>
      )}

      {/* المحتوى */}
      <div className="flex min-h-dvh flex-col lg:mr-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <button
            className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="القائمة"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="text-lg font-extrabold tracking-tight">{title}</h1>
          <div className="mr-auto flex items-center gap-1.5">
            <RemindersBell />
            <NotificationBell />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
      <PwaSetup />
    </div>
  );
}
