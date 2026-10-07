"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/time";
import { PushEnableButton } from "@/components/pwa/push-enable-button";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

// جرس الإشعارات الداخلية: يستطلع /api/notifications كل ٣٠ ثانية وعند التركيز
// النقر على إشعار يعلّمه مقروءاً وينتقل إلى رابطه
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // تجاهل أخطاء الشبكة في الاستطلاع
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markRead = async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  };

  const onItemClick = (n: NotificationItem) => {
    if (!n.readAt) markRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant="ghost"
        size="icon"
        title={unreadCount > 0 ? `${unreadCount} إشعارات غير مقروءة` : "الإشعارات"}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? "٩٩+" : unreadCount}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute end-0 top-full z-20 mt-1 w-80 rounded-md border bg-background p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-xs text-muted-foreground">الإشعارات</p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:underline"
              >
                تحديد الكل كمقروء
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">
              لا إشعارات بعد
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  className="flex w-full items-start gap-2 rounded-sm p-2 text-start text-sm hover:bg-muted"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.readAt ? "bg-transparent" : "bg-primary"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{n.title}</span>
                    <span className="block line-clamp-2 text-xs text-muted-foreground">
                      {n.body}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {relativeTime(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 border-t pt-2">
            <PushEnableButton />
          </div>
        </div>
      )}
    </div>
  );
}
