"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, GripVertical, Inbox, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTACT_STAGES, stageConfig } from "@/lib/contact-stages";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type ContactRow = {
  id: string;
  name: string | null;
  waPhone: string;
  stage: string;
  tags: string[];
  notes: string | null;
  createdAt: string;
  conversationCount: number;
  bookingCount: number;
  lastConversation: {
    id: string;
    status: string;
    lastMessageAt: string | null;
  } | null;
};

// لوحة كانبان لمسار البيع: بحث وفلاتر (وسم) + تصدير CSV + سحب وإفلات لتغيير المرحلة
export function ContactsClient() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [overStage, setOverStage] = useState<string | null>(null);
  const [savingStage, setSavingStage] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (tag.trim()) params.set("tag", tag.trim());
      const res = await fetch(`/api/contacts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts);
      }
    } finally {
      setLoading(false);
    }
  }, [q, tag]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // تصدير CSV — مع BOM ليفتح Excel العربية بترميز صحيح
  function exportCsv() {
    const header = "الاسم,الرقم,مرحلة العميل,وسوم,عدد المحادثات,عدد الحجوزات,تاريخ الإضافة\n";
    const rows = contacts
      .map((c) =>
        [
          c.name ?? "",
          c.waPhone,
          CONTACT_STAGES.find((s) => s.value === c.stage)?.label ?? c.stage,
          c.tags.join(" | "),
          c.conversationCount,
          c.bookingCount,
          new Date(c.createdAt).toLocaleDateString("ar"),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `العملاء-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDrop(e: React.DragEvent, stage: string) {
    e.preventDefault();
    setOverStage(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id || savingStage) return;
    const contact = contacts.find((c) => c.id === id);
    if (!contact || contact.stage === stage) return;

    const previous = contact.stage;
    // تحريك تفاؤلي فوري، والتراجع عند الفشل
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, stage } : c))
    );
    setSavingStage(true);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setContacts((prev) =>
          prev.map((c) => (c.id === id ? { ...c, stage: previous } : c))
        );
        alert(err?.error ?? "تعذّر تحديث المرحلة");
      }
    } catch {
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, stage: previous } : c))
      );
      alert("تعذّر تحديث المرحلة");
    } finally {
      setSavingStage(false);
    }
  }

  const countOf = (stage: string) =>
    contacts.filter((c) => c.stage === stage).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">العملاء ({contacts.length})</h1>
        <Button variant="outline" onClick={exportCsv} disabled={contacts.length === 0}>
          <Download className="h-4 w-4" />
          تصدير CSV
        </Button>
      </div>

      {/* الفلاتر */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بالاسم أو الرقم…"
            className="ps-8"
          />
        </div>
        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="وسم…"
          className="w-32"
        />
      </div>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
          لا عملاء مطابقون للفلاتر
        </div>
      ) : (
        /* لوحة كانبان: عمود لكل مرحلة — الحاوية dir=rtl فتبدأ المرحلة الأولى من اليمين */
        <div className="flex gap-3 overflow-x-auto pb-2">
          {CONTACT_STAGES.map((s) => (
            <div
              key={s.value}
              onDragOver={(e) => {
                e.preventDefault();
                if (overStage !== s.value) setOverStage(s.value);
              }}
              onDragLeave={() => setOverStage((v) => (v === s.value ? null : v))}
              onDrop={(e) => void handleDrop(e, s.value)}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors",
                overStage === s.value && "border-primary bg-accent/40 ring-2 ring-primary"
              )}
            >
              {/* رأس العمود */}
              <div className="flex items-center gap-2 border-b p-3">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: stageConfig(s.value).color }}
                />
                <span className="text-sm font-medium">{s.label}</span>
                <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {countOf(s.value)}
                </span>
              </div>

              {/* جسم العمود: بطاقات قابلة للسحب */}
              <div className="flex min-h-[80px] flex-col gap-2 p-2">
                {contacts
                  .filter((c) => c.stage === s.value)
                  .map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="cursor-grab rounded-lg border bg-card p-2.5 text-sm shadow-sm active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-medium">
                          {c.name ?? c.waPhone}
                        </p>
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </div>
                      {c.name && (
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {c.waPhone}
                        </p>
                      )}
                      {c.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {c.tags.slice(0, 2).map((t) => (
                            <Badge key={t} variant="outline" className="px-1.5 text-[10px]">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          {c.lastConversation?.lastMessageAt
                            ? relativeTime(c.lastConversation.lastMessageAt)
                            : relativeTime(c.createdAt)}
                        </span>
                        {c.bookingCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-primary">
                            <CalendarDays className="h-3 w-3" />
                            {c.bookingCount}
                          </span>
                        )}
                      </div>
                      {c.lastConversation && (
                        <Link
                          href={`/inbox?c=${c.lastConversation.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] text-primary hover:bg-muted"
                        >
                          <Inbox className="h-3 w-3" />
                          فتح
                        </Link>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
