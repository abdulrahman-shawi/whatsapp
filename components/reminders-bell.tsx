"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messageTime } from "@/lib/time";

type DueItem = {
  id: string;
  contactName: string;
  followUpAt: string;
  assignees: { id: string; name: string }[];
};

// جرس إشعارات المتابعات: يستطلع /api/notifications كل دقيقة
// ويعرض المحادثات التي حان موعد متابعتها — النقر يفتحها في الوارد
export function RemindersBell() {
  const [items, setItems] = useState<DueItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setItems(data.items);
        }
      } catch {
        // تجاهل أخطاء الشبكة في الاستطلاع
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        title={
          items.length > 0
            ? `${items.length} متابعات حان موعدها`
            : "إشعارات المتابعات"
        }
        onClick={() => setOpen((v) => !v)}
      >
        <BellRing className="h-4 w-4" />
        {items.length > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {items.length}
          </span>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-full z-20 mt-1 w-80 rounded-md border bg-background p-2 shadow-lg">
            <p className="px-2 py-1 text-xs text-muted-foreground">
              متابعات حان موعدها ({items.length})
            </p>
            {items.length === 0 ? (
              <p className="p-3 text-center text-sm text-muted-foreground">
                لا متابعات مستحقة الآن
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/inbox?c=${item.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-sm p-2 text-sm hover:bg-muted"
                  >
                    <CalendarClock className="h-4 w-4 shrink-0 text-amber-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {item.contactName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {messageTime(item.followUpAt)}
                        {item.assignees.length > 0 &&
                          ` — ${item.assignees.map((a) => a.name).join("، ")}`}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
