"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Bot, MessageSquareCode, Megaphone, Gauge, CreditCard, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

// روابط التنقل في الشريط الجانبي مع تمييز الصفحة الحالية
const navItems = [
  { href: "/inbox", label: "الوارد", icon: Inbox },
  { href: "/broadcast", label: "الحملات", icon: Megaphone, ownerOnly: true },
  { href: "/agents", label: "الوكلاء", icon: Bot, ownerOnly: true },
  { href: "/widget", label: "الويدجت", icon: MessageSquareCode },
  { href: "/usage", label: "الاستهلاك", icon: Gauge },
  { href: "/billing", label: "الاشتراك", icon: CreditCard, ownerOnly: true },
  { href: "/settings", label: "الإعدادات", icon: Settings, ownerOnly: true },
];

// الموظف يرى الوارد والويدجت والاستهلاك فقط، والمالك يرى الكل
export function SidebarNav({ role }: { role: "OWNER" | "STAFF" }) {
  const pathname = usePathname();
  const items = navItems.filter((item) => role === "OWNER" || !item.ownerOnly);

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
