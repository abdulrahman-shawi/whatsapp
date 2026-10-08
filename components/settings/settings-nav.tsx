"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type SettingsNavItem = { id: string; label: string; href?: string };
export type SettingsNavGroup = { label: string; items: SettingsNavItem[] };

// شريط تنقل داخلي لصفحة الإعدادات بأسلوب Flovoo:
// مجموعات مع تتبع القسم الظاهر حالياً عبر IntersectionObserver
export function SettingsNav({
  groups,
  sectionIds,
}: {
  groups: SettingsNavGroup[];
  sectionIds: string[];
}) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sectionIds]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className="sticky top-6 space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          {group.label !== "الرئيسية" && (
            <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = active === item.id;
              const cls = `block w-full rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-accent font-semibold text-primary"
                  : "text-foreground/80 hover:bg-accent/60"
              }`;
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link href={item.href} className={cls}>
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => scrollTo(item.id)}
                      className={`${cls} text-right`}
                    >
                      {item.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
