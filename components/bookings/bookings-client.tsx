"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type BookingItem = {
  id: string;
  title: string;
  notes: string | null;
  scheduledAt: string;
  remindedAt: string | null;
  contact: { id: string; name: string | null; waPhone: string };
};

const WEEKDAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

// تقويم شهري لحجوزات مساحة العمل + إنشاء سريع بالنقر على يوم
export function BookingsClient() {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // نموذج الإنشاء السريع
  const [form, setForm] = useState({ waPhone: "", title: "", time: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date(month.getFullYear(), month.getMonth(), 1);
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      const res = await fetch(
        `/api/bookings?from=${from.toISOString()}&to=${to.toISOString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings);
      }
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  // شبكة الأيام: نبدأ من السبت قبل أول يوم في الشهر
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 1) % 7)); // السبت = بداية الأسبوع
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [month]);

  const bookingsOfDay = (d: Date) =>
    bookings.filter((b) => {
      const t = new Date(b.scheduledAt);
      return (
        t.getFullYear() === d.getFullYear() &&
        t.getMonth() === d.getMonth() &&
        t.getDate() === d.getDate()
      );
    });

  const isToday = (d: Date) => d.toDateString() === today.toDateString();

  async function handleCreate() {
    if (!selectedDay || !form.waPhone.trim() || !form.title.trim() || !form.time) return;
    setSaving(true);
    try {
      const scheduledAt = new Date(`${selectedDay}T${form.time}`);
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waPhone: form.waPhone.trim(),
          title: form.title.trim(),
          scheduledAt: scheduledAt.toISOString(),
          notes: form.notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setForm({ waPhone: "", title: "", time: "", notes: "" });
        setSelectedDay(null);
        load();
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.error ?? "تعذّر إنشاء الحجز");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("حذف هذا الحجز؟")) return;
    const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
    if (res.ok) {
      setBookings((prev) => prev.filter((b) => b.id !== id));
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error ?? "تعذّر حذف الحجز");
    }
  }

  const dayStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <CalendarDays className="h-5 w-5" />
          الحجوزات
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center font-medium">
            {new Intl.DateTimeFormat("ar", { month: "long", year: "numeric" }).format(month)}
          </span>
          <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
            اليوم
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        تذكير تلقائي للعميل برسالة واتساب ساعة قبل كل موعد — يعمل مع مهمة الكرون كل ٥ دقائق
      </p>

      {/* رأس الأسبوع */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="p-2 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
      </div>

      {/* شبكة الشهر */}
      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const dayBookings = bookingsOfDay(d);
            const inMonth = d.getMonth() === month.getMonth();
            const selected = selectedDay === dayStr(d);
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelectedDay(selected ? null : dayStr(d))}
                className={cn(
                  "flex min-h-20 flex-col gap-0.5 rounded-md border p-1.5 text-start align-top transition-colors",
                  inMonth ? "bg-card hover:bg-muted/50" : "bg-muted/20 text-muted-foreground",
                  isToday(d) && "border-primary border-2",
                  selected && "bg-accent"
                )}
              >
                <span className="text-xs font-medium">{d.getDate()}</span>
                {dayBookings.slice(0, 3).map((b) => (
                  <span
                    key={b.id}
                    className="flex items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] text-primary"
                    title={`${b.title} — ${b.contact.name ?? b.contact.waPhone}`}
                  >
                    <span className="flex-1 truncate">
                      {new Date(b.scheduledAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}{" "}
                      {b.title}
                    </span>
                    <span
                      role="button"
                      aria-label="حذف الحجز"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(b.id);
                      }}
                      className="shrink-0 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </span>
                  </span>
                ))}
                {dayBookings.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{dayBookings.length - 3}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* نموذج إنشاء سريع لليوم المحدد */}
      {selectedDay && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg rounded-t-xl border bg-background p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium">حجز جديد — {new Date(selectedDay).toLocaleDateString("ar", { dateStyle: "full" })}</p>
            <button onClick={() => setSelectedDay(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2">
            <Input
              value={form.waPhone}
              onChange={(e) => setForm((f) => ({ ...f, waPhone: e.target.value }))}
              placeholder="رقم العميل (مثال: 9639xxxxxxxx)"
              dir="ltr"
            />
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="عنوان الموعد (مثال: استشارة، صيانة)"
            />
            <div className="flex gap-2">
              <Input
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              />
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="ملاحظات (اختياري)"
                className="flex-1"
              />
            </div>
            <Button onClick={handleCreate} disabled={saving || !form.waPhone.trim() || !form.title.trim() || !form.time}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              حفظ الحجز
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
