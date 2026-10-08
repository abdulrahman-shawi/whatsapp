"use client";

import { useState } from "react";
import {
  Globe,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { relativeTime } from "@/lib/time";
import { OUTBOUND_EVENT_GROUPS } from "@/lib/outbound-events";

export type OutboundWebhookItem = {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastFiredAt: string | null;
  lastStatus: number | null;
  createdAt: string;
};

// تسمية حدث من الكتالوج — يعيد المفتاح نفسه إن لم يُعرف
function eventLabel(key: string): string {
  for (const group of OUTBOUND_EVENT_GROUPS) {
    const found = group.events.find((e) => e.key === key);
    if (found) return `${found.label} (${key})`;
  }
  return key;
}

// الويب هوك الصادر: تسجيل روابط تستقبل أحداث المنصة (رسائل، عملاء، محادثات…)
export function OutboundWebhooksPanel({
  initialWebhooks,
}: {
  initialWebhooks: OutboundWebhookItem[];
}) {
  const [webhooks, setWebhooks] = useState<OutboundWebhookItem[]>(initialWebhooks);
  const [editing, setEditing] = useState<OutboundWebhookItem | "new" | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  function startEdit(webhook: OutboundWebhookItem | "new") {
    setEditing(webhook);
    setError("");
    setNotice("");
    if (webhook === "new") {
      setName("");
      setUrl("");
      setSecret("");
      setSelectedEvents([]);
    } else {
      setName(webhook.name);
      setUrl(webhook.url);
      setSecret("");
      setSelectedEvents(webhook.events);
    }
  }

  function toggleEvent(key: string) {
    setSelectedEvents((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function validateDraft(): string {
    if (!url.trim()) return "رابط الويب هوك مطلوب";
    if (!/^https?:\/\//i.test(url.trim()))
      return "الرابط يجب أن يبدأ بـ http:// أو https://";
    if (url.trim().length > 500) return "الرابط حتى ٥٠٠ حرف";
    if (selectedEvents.length === 0) return "اختر حدثاً واحداً على الأقل";
    if (secret.length > 128) return "السر حتى ١٢٨ حرفاً";
    return "";
  }

  async function handleSave() {
    const clientError = validateDraft();
    if (clientError) {
      setError(clientError);
      return;
    }
    setSaving(true);
    setError("");
    // السر فارغ عند التحرير = إبقاء الموجود في قاعدة البيانات
    const payload = {
      name: name.trim(),
      url: url.trim(),
      events: selectedEvents,
      ...(secret ? { secret } : {}),
    };
    const isNew = editing === "new";
    const res = await fetch(
      isNew ? "/api/outbound-hooks" : `/api/outbound-hooks/${(editing as OutboundWebhookItem).id}`,
      {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    setSaving(false);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.webhook) {
      setError(data?.error ?? "حدث خطأ أثناء حفظ الويب هوك");
      return;
    }
    const saved: OutboundWebhookItem = {
      id: data.webhook.id,
      name: data.webhook.name,
      url: data.webhook.url,
      events: data.webhook.events,
      isActive: data.webhook.isActive,
      lastFiredAt: data.webhook.lastFiredAt ?? null,
      lastStatus: data.webhook.lastStatus ?? null,
      createdAt: data.webhook.createdAt,
    };
    setWebhooks((prev) =>
      isNew ? [saved, ...prev] : prev.map((w) => (w.id === saved.id ? saved : w))
    );
    setEditing(null);
  }

  async function handleToggle(webhook: OutboundWebhookItem) {
    setBusyId(webhook.id);
    setError("");
    const res = await fetch(`/api/outbound-hooks/${webhook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !webhook.isActive }),
    });
    setBusyId(null);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.webhook) {
      setError(data?.error ?? "حدث خطأ أثناء تغيير الحالة");
      return;
    }
    setWebhooks((prev) =>
      prev.map((w) =>
        w.id === webhook.id
          ? {
              ...w,
              isActive: data.webhook.isActive,
              lastFiredAt: data.webhook.lastFiredAt ?? null,
              lastStatus: data.webhook.lastStatus ?? null,
            }
          : w
      )
    );
  }

  async function handleDelete(webhook: OutboundWebhookItem) {
    const label = webhook.name || webhook.url;
    if (!window.confirm(`حذف الويب هوك "${label}" نهائياً؟`)) return;
    setBusyId(webhook.id);
    setError("");
    const res = await fetch(`/api/outbound-hooks/${webhook.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء الحذف");
      return;
    }
    setWebhooks((prev) => prev.filter((w) => w.id !== webhook.id));
    if (editing !== "new" && editing?.id === webhook.id) setEditing(null);
  }

  // إرسال تجريبي: يطلق حدث ping ويعرض رمز الاستجابة المُستلَم
  async function handleTest(webhook: OutboundWebhookItem) {
    setTestingId(webhook.id);
    setError("");
    setNotice("");
    const res = await fetch(`/api/outbound-hooks/${webhook.id}`, { method: "POST" });
    setTestingId(null);
    const data = await res.json().catch(() => null);
    if (!res.ok || typeof data?.status !== "number") {
      setError(data?.error ?? "تعذّر إرسال الاختبار");
      return;
    }
    setNotice(
      data.status > 0
        ? `وصل الاختبار — رمز الاستجابة ${data.status}`
        : "لم يستجب الخادم (خطأ في الشبكة أو انتهت المهلة)"
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">الويب هوكات الصادرة ({webhooks.length})</h2>
        <Button
          size="sm"
          onClick={() => startEdit("new")}
          disabled={editing !== null}
        >
          <Plus className="h-4 w-4" />
          ويب هوك صادر جديد
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}

      {/* محرر إنشاء/تحرير ويب هوك صادر */}
      {editing !== null && (
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Send className="h-5 w-5" />
            {editing === "new" ? "ويب هوك صادر جديد" : `تحرير: ${editing.name || editing.url}`}
          </h2>

          <div>
            <Label htmlFor="oh-url">رابط الاستقبال (URL)</Label>
            <Input
              id="oh-url"
              dir="ltr"
              className="mt-1.5 text-left"
              placeholder="https://example.com/hooks/flovoo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="oh-name">اسم داخلي (اختياري)</Label>
            <Input
              id="oh-name"
              className="mt-1.5"
              placeholder="مثال: إشعارات المتجر"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="oh-secret">
              سر التوقيع HMAC (اختياري — يُرسل بترويسة X-Flovoo-Signature)
            </Label>
            <Input
              id="oh-secret"
              dir="ltr"
              type="password"
              className="mt-1.5 text-left"
              placeholder="اتركه فارغاً لإبقاء الموجود"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <Label>الأحداث المشترك فيها</Label>
            {OUTBOUND_EVENT_GROUPS.map((group) => (
              <div key={group.category} className="rounded-md border bg-muted/30 p-3">
                <h3 className="mb-2 text-sm font-semibold">{group.category}</h3>
                <div className="space-y-2">
                  {group.events.map((event) => (
                    <label
                      key={event.key}
                      className="flex cursor-pointer items-start gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        checked={selectedEvents.includes(event.key)}
                        onChange={() => toggleEvent(event.key)}
                      />
                      <span>
                        <span className="block font-medium">{event.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {event.description} — <code dir="ltr">{event.key}</code>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "جارٍ الحفظ…" : "حفظ الويب هوك"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {/* شرح شكل الحمولة للمستقبِل الخارجي */}
      <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
        <h3 className="text-sm font-semibold">شكل الحمولة المُرسل لرابطك</h3>
        <p className="text-sm text-muted-foreground">
          طلب POST بصيغة JSON مع الترويسات{" "}
          <code dir="ltr">X-Flovoo-Event</code> و{" "}
          <code dir="ltr">User-Agent: Flovoo-Webhook</code> — وإذا ضُبط سر
          فإن توقيع <code dir="ltr">X-Flovoo-Signature</code> يكون HMAC-SHA256
          للنص الخام بالسر:
        </p>
        <pre dir="ltr" className="overflow-x-auto rounded-md bg-background p-3 text-xs">
{`{
  "event": "message.created",
  "firedAt": "2025-01-01T12:00:00.000Z",
  "data": { /* بيانات الحدث */ }
}`}
        </pre>
      </div>

      {/* قائمة الويب هوكات الصادرة */}
      {webhooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد ويب هوكات صادرة بعد — أنشئ واحداً لاستقبال أحداث المنصة في نظامك
        </p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((w) => (
            <div key={w.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{w.name || "بدون اسم"}</span>
                  <Badge variant={w.isActive ? "success" : "outline"}>
                    {w.isActive ? "نشط" : "متوقف"}
                  </Badge>
                  <Badge
                    variant="secondary"
                    title={w.events.map(eventLabel).join("\n")}
                  >
                    {w.events.length}{" "}
                    {w.events.length === 1 ? "حدث" : "أحداث"}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  آخر إطلاق:{" "}
                  {w.lastFiredAt ? relativeTime(w.lastFiredAt) : "—"}{" "}
                  {w.lastStatus !== null && (
                    <span
                      className={
                        w.lastStatus >= 200 && w.lastStatus < 300
                          ? "text-emerald-600"
                          : "text-red-600"
                      }
                    >
                      ({w.lastStatus === 0 ? "خطأ شبكة" : w.lastStatus})
                    </span>
                  )}
                </span>
              </div>

              <div className="mt-2" dir="ltr">
                <code className="block truncate rounded-md bg-muted px-2 py-1 text-left text-xs">
                  {w.url}
                </code>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(w)}
                  disabled={editing !== null}
                >
                  <Pencil className="h-4 w-4" />
                  تحرير
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTest(w)}
                  disabled={testingId === w.id || busyId === w.id}
                >
                  {testingId === w.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  إرسال تجريبي
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggle(w)}
                  disabled={busyId === w.id}
                >
                  {w.isActive ? "إيقاف" : "تفعيل"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(w)}
                  disabled={busyId === w.id}
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
