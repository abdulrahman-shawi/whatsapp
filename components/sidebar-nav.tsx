"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Bot, MessageSquareCode, Megaphone, Settings, Workflow, BarChart3, Users, CalendarDays, ClipboardList, ScrollText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// روابط التنقل مجمّعة في أقسام — الحبّة الزمردية للصفحة الحالية
const navSections = [
  {
    label: "الرئيسية",
    items: [
      { href: "/inbox", label: "الوارد", icon: Inbox },
      { href: "/contacts", label: "العملاء", icon: Users },
    ],
  },
  {
    label: "العمليات",
    items: [
      { href: "/bookings", label: "الحجوزات", icon: CalendarDays },
      { href: "/broadcast", label: "الحملات", icon: Megaphone, ownerOnly: true },
      { href: "/forms", label: "نماذج العملاء", icon: ClipboardList, ownerOnly: true },
      { href: "/reports", label: "التقارير", icon: BarChart3 },
    ],
  },
  {
    label: "الأتمتة",
    items: [
      { href: "/workflows", label: "سير العمل", icon: Workflow, ownerOnly: true },
      { href: "/agents", label: "الوكلاء", icon: Bot, ownerOnly: true },
      { href: "/audit", label: "سجل التدقيق", icon: ScrollText, ownerOnly: true },
    ],
  },
  {
    label: "النظام",
    items: [
      { href: "/widget", label: "الويدجت", icon: MessageSquareCode },
      { href: "/admin", label: "لوحة المنصة", icon: ShieldCheck, ownerOnly: true },
      { href: "/settings", label: "الإعدادات", icon: Settings, ownerOnly: true },
    ],
  },
] as const;

// الموظف يرى الوارد والويدجت والاستهلاك فقط، والمالك يرى الكل
export function SidebarNav({
  role,
  onNavigate,
}: {
  role: "OWNER" | "STAFF";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5">
      {navSections.map((section) => {
        const items = section.items.filter(
          (item) => role === "OWNER" || !("ownerOnly" in item && item.ownerOnly)
        );
        if (items.length === 0) return null;
        return (
          <div key={section.label}>
            <p className="mb-1.5 px-3 text-[11px] font-bold tracking-wide text-white/30">
              {section.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-full px-3.5 text-[13.5px] font-medium transition-all duration-200",
                        active
                          ? "bg-primary font-bold text-primary-foreground"
                          : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                      )}
                    >
                      <item.icon className="size-[18px] shrink-0" strokeWidth={2.1} />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
