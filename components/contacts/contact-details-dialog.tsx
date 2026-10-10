"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  UserPlus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONTACT_STAGES, stageConfig } from "@/lib/contact-stages";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Profile = {
  contact: {
    id: string;
    name: string | null;
    email: string | null;
    waPhone: string;
    notes: string | null;
    tags: string[];
    stage: string;
    leadScore: number;
    blocked: boolean;
    createdAt: string;
    conversationCount: number;
    bookingCount: number;
  };
  conversations: {
    id: string;
    status: string;
    lastMessageAt: string | null;
    createdAt: string;
    closedAt: string | null;
    isArchived: boolean;
    summary: string | null;
    messageCount: number;
  }[];
  bookings: {
    id: string;
    title: string;
    scheduledAt: string;
    notes: string | null;
  }[];
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "warning" | "secondary" }> = {
  AI: { label: "آلي", variant: "default" },
  MANUAL: { label: "يدوي", variant: "warning" },
  HANDED_OFF: { label: "مسلّم", variant: "secondary" },
};

// نافذة تفاصيل العميل: تعرض عند تحديد contactId وتُغلق عند null — onClose(changed) لإعادة تحميل القائمة
export function ContactDetailsDialog({
  contactId,
  onClose,
}: {
  contactId: string | null;
  onClose: (changed: boolean) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingStage, setSavingStage] = useState(false);
  // هل عدّل المستخدم المرحلة داخل النافذة؟ تُمرَّر لمن استدعانا ليعيد التحميل
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!contactId) {
      setProfile(null);
      setChanged(false);
      return;
    }
    setLoading(true);
    setError(null);
    setProfile(null);
    fetch(`/api/contacts/${contactId}/profile`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "تعذّر تحميل بيانات العميل");
        }
        return res.json();
      })
      .then(setProfile)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [contactId]);

  // تغيير مرحلة العميل من داخل النافذة — تحديث محلي فوري وتنبيه عند الفشل
  async function changeStage(stage: string) {
    if (!profile || profile.contact.stage === stage) return;
    const previous = profile.contact.stage;
    setProfile((p) =>
      p ? { ...p, contact: { ...p.contact, stage } } : p
    );
    setSavingStage(true);
    try {
      const res = await fetch(`/api/contacts/${profile.contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error();
      setChanged(true);
    } catch {
      setProfile((p) =>
        p ? { ...p, contact: { ...p.contact, stage: previous } } : p
      );
      alert("تعذّر تحديث المرحلة");
    } finally {
      setSavingStage(false);
    }
  }

  if (!contactId) return null;

  const c = profile?.contact;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={() => onClose(changed)}
      />
      <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[520px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
        {/* الرأس */}
        <div className="flex items-start justify-between gap-2 border-b p-4">
          {c ? (
            <div>
              <h3 className="text-lg font-bold">{c.name ?? c.waPhone}</h3>
              {c.name && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground" dir="ltr">
                  <Phone className="h-3.5 w-3.5" />
                  {c.waPhone}
                </p>
              )}
              {c.email && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground" dir="ltr">
                  <Mail className="h-3.5 w-3.5" />
                  {c.email}
                </p>
              )}
            </div>
          ) : (
            <h3 className="text-lg font-bold">تفاصيل العميل</h3>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => onClose(changed)}
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* الجسم */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive">
              {error}
            </div>
          ) : !profile || !c ? null : (
            <>
              {/* المرحلة — قابلة للتغيير */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">المرحلة:</span>
                <Badge
                  className="text-white"
                  style={{ backgroundColor: stageConfig(c.stage).color }}
                >
                  {stageConfig(c.stage).label}
                </Badge>
                <select
                  value={c.stage}
                  disabled={savingStage}
                  onChange={(e) => void changeStage(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-50"
                >
                  {CONTACT_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold",
                    c.leadScore >= 70
                      ? "bg-emerald-100 text-emerald-700"
                      : c.leadScore >= 40
                        ? "bg-amber-100 text-amber-700"
                        : "bg-muted text-muted-foreground"
                  )}
                  title="نقاط تقييم العميل"
                >
                  {c.leadScore} نقطة
                </span>
                {c.blocked && (
                  <Badge variant="outline" className="border-red-300 text-red-600">
                    محظور
                  </Badge>
                )}
              </div>

              {/* الوسوم */}
              {c.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {c.tags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}

              {/* الملاحظات */}
              {c.notes && (
                <div className="rounded-lg bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                  {c.notes}
                </div>
              )}

              {/* إحصاءات */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat icon={<MessageSquare className="h-4 w-4" />} label="المحادثات" value={c.conversationCount} />
                <Stat icon={<CalendarDays className="h-4 w-4" />} label="الحجوزات" value={c.bookingCount} />
                <Stat
                  icon={<UserPlus className="h-4 w-4" />}
                  label="أُضيف"
                  value={new Date(c.createdAt).toLocaleDateString("ar")}
                />
                <Stat
                  icon={<Inbox className="h-4 w-4" />}
                  label="آخر رسالة"
                  value={
                    profile.conversations[0]?.lastMessageAt
                      ? relativeTime(profile.conversations[0].lastMessageAt)
                      : "—"
                  }
                />
              </div>

              {/* المحادثات الأخيرة */}
              <section>
                <h4 className="mb-2 text-sm font-semibold">
                  المحادثات الأخيرة ({profile.conversations.length})
                </h4>
                {profile.conversations.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    لا محادثات بعد
                  </p>
                ) : (
                  <div className="space-y-2">
                    {profile.conversations.map((conv) => {
                      const st = STATUS_LABEL[conv.status] ?? STATUS_LABEL.AI;
                      return (
                        <div
                          key={conv.id}
                          className="flex items-center gap-2 rounded-lg border p-2.5 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={st.variant}>{st.label}</Badge>
                              {conv.closedAt && (
                                <Badge variant="outline">مغلقة</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {conv.messageCount} رسالة
                              </span>
                            </div>
                            {conv.summary && (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {conv.summary}
                              </p>
                            )}
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {conv.lastMessageAt
                                ? relativeTime(conv.lastMessageAt)
                                : relativeTime(conv.createdAt)}
                            </p>
                          </div>
                          <Link
                            href={`/inbox?c=${conv.id}`}
                            className="inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs text-primary hover:bg-muted"
                          >
                            <Inbox className="h-3 w-3" />
                            فتح
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* الحجوزات */}
              {profile.bookings.length > 0 && (
                <section>
                  <h4 className="mb-2 text-sm font-semibold">
                    الحجوزات ({profile.bookings.length})
                  </h4>
                  <div className="space-y-2">
                    {profile.bookings.map((b) => (
                      <div key={b.id} className="rounded-lg border p-2.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{b.title}</p>
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1 text-xs",
                              new Date(b.scheduledAt) > new Date()
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          >
                            <CalendarDays className="h-3 w-3" />
                            {dateTime(b.scheduledAt)}
                          </span>
                        </div>
                        {b.notes && (
                          <p className="mt-1 text-xs text-muted-foreground">{b.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/20 p-2 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
