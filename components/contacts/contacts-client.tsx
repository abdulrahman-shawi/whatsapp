"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, Inbox, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTACT_STAGES, stageConfig } from "@/lib/contact-stages";
import { relativeTime } from "@/lib/time";
import { StageBadge } from "@/components/inbox/stage-badge";

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

// قائمة العملاء الكاملة: بحث وفلاتر (مرحلة/وسم) + تصدير CSV
export function ContactsClient() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [tag, setTag] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (stage) params.set("stage", stage);
      if (tag.trim()) params.set("tag", tag.trim());
      const res = await fetch(`/api/contacts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts);
      }
    } finally {
      setLoading(false);
    }
  }, [q, stage, tag]);

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
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">كل المراحل</option>
          {CONTACT_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="وسم…"
          className="w-32"
        />
      </div>

      {/* الجدول */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-start text-xs text-muted-foreground">
              <th className="p-3 text-start font-medium">الاسم</th>
              <th className="p-3 text-start font-medium">الرقم</th>
              <th className="p-3 text-start font-medium">المرحلة</th>
              <th className="p-3 text-start font-medium">الوسوم</th>
              <th className="p-3 text-center font-medium">محادثات</th>
              <th className="p-3 text-center font-medium">حجوزات</th>
              <th className="p-3 text-start font-medium">آخر نشاط</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-10 text-center text-muted-foreground">
                  لا عملاء مطابقون للفلاتر
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium">{c.name ?? "—"}</td>
                  <td className="p-3 text-muted-foreground" dir="ltr">
                    {c.waPhone}
                  </td>
                  <td className="p-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: stageConfig(c.stage).color }}
                      />
                      <StageBadge stage={c.stage} />
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="flex max-w-40 flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t} variant="outline" className="px-1.5 text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className="p-3 text-center">{c.conversationCount}</td>
                  <td className="p-3 text-center">
                    {c.bookingCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {c.bookingCount}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {c.lastConversation?.lastMessageAt
                      ? relativeTime(c.lastConversation.lastMessageAt)
                      : "—"}
                  </td>
                  <td className="p-3">
                    {c.lastConversation && (
                      <Link
                        href={`/inbox?c=${c.lastConversation.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Inbox className="h-3.5 w-3.5" />
                        فتح
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
