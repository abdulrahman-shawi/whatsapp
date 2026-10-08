"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

export type SettingsNavItem = { id: string; label: string; href?: string };
export type SettingsNavGroup = { label: string; items: SettingsNavItem[] };
export type SettingsSectionDef = {
  id: string;
  group: string;
  node: ReactNode;
};

// هيكل صفحة الإعدادات: شريط تنقل داخلي يبدّل الأقسام —
// قسم واحد ظاهر فقط، والباقي مخفي
export function SettingsShell({
  groups,
  sections,
  defaultId,
}: {
  groups: SettingsNavGroup[];
  sections: SettingsSectionDef[];
  defaultId: string;
}) {
  const [active, setActive] = useState(defaultId);
  const activeSection = sections.find((s) => s.id === active);

  return (
    <div className="flex items-start gap-6">
      {/* شريط التنقل الداخلي — يمين المحتوى في RTL */}
      <aside className="hidden w-52 shrink-0 lg:block">
        <nav className="sticky top-6 space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = !item.href && active === item.id;
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
                          onClick={() => setActive(item.id)}
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
      </aside>

      {/* القسم النشط فقط */}
      <div className="min-w-0 flex-1">
        {activeSection && (
          <div key={activeSection.id}>
            <h2 className="mb-4 text-lg font-bold">{activeSection.group}</h2>
            {activeSection.node}
          </div>
        )}
      </div>
    </div>
  );
}
