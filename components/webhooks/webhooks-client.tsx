"use client";

import { useEffect, useState } from "react";
import { ClipboardCopy, Loader2, Pencil, Plus, Trash2, Webhook } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { relativeTime } from "@/lib/time";

type WebhookItem = {
  id: string;
  name: string;
  token: string;
  workflowId: string | null;
  autoTag: string;
  isActive: boolean;
  lastHitAt: string | null;
  createdAt: string;
};

const selectClass =
  "mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// الويب هوك الوارد: إنشاء رابط استقبال عام وإدارته ونسخ رابطه
export function WebhooksClient({
  initialWebhooks,
  workflows,
}: {
  initialWebhooks: WebhookItem[];
  workflows: { id: string; name: string }[];
}) {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>(initialWebhooks);
  const [editing, setEditing] = useState<WebhookItem | "new" | null>(null);

  const [name, setName] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [autoTag, setAutoTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function startEdit(webhook: WebhookItem | "new") {
    setEditing(webhook);
    setError("");
    setNotice("");
    if (webhook === "new") {
      setName("");
      setWorkflowId("");
      setAutoTag("");
    } else {
      setName(webhook.name);
      setWorkflowId(webhook.workflowId ?? "");
      setAutoTag(webhook.autoTag);
    }
  }

  function validateDraft(): string {
    if (!name.trim()) return "اسم الويب هوك مطلوب";
    if (autoTag.trim().length > 40) return "الوسم التلقائي حتى ٤٠ حرفاً";
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
    const payload = {
      name: name.trim(),
      workflowId: workflowId || null,
      autoTag: autoTag.trim(),
    };
    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/hooks" : `/api/hooks/${(editing as WebhookItem).id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.webhook) {
      setError(data?.error ?? "حدث خطأ أثناء حفظ الويب هوك");
      return;
    }
    const saved: WebhookItem = {
      ...data.webhook,
      createdAt: data.webhook.createdAt,
      lastHitAt: data.webhook.lastHitAt ?? null,
    };
    setWebhooks((prev) =>
      isNew ? [saved, ...prev] : prev.map((w) => (w.id === saved.id ? saved : w))
    );
    setEditing(null);
  }

  async function handleToggle(webhook: WebhookItem) {
    setBusyId(webhook.id);
    setError("");
    const res = await fetch(`/api/hooks/${webhook.id}`, {
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
    setWebhooks((prev) => prev.map((w) => (w.id === webhook.id ? data.webhook : w)));
  }

  async function handleDelete(webhook: WebhookItem) {
    if (!window.confirm(`حذف الويب هوك "${webhook.name}" نهائياً؟`)) return;
    setBusyId(webhook.id);
    setError("");
    const res = await fetch(`/api/hooks/${webhook.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء الحذف");
      return;
    }
    setWebhooks((prev) => prev.filter((w) => w.id !== webhook.id));
    if (editing !== "new" && editing?.id === webhook.id) setEditing(null);
  }

  function copyUrl(webhook: WebhookItem) {
    navigator.clipboard
      .writeText(receiverUrl(webhook))
      .then(() => {
        setNotice("تم نسخ رابط الاستقبال");
        setTimeout(() => setNotice(""), 3000);
      })
      .catch(() => setError("تعذر النسخ — انسخ الرابط يدوياً"));
  }

  function receiverUrl(webhook: WebhookItem) {
    return `${origin}/api/hooks/${webhook.token}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">الويب هوك ({webhooks.length})</h2>
        <Button
          size="sm"
          onClick={() => startEdit("new")}
          disabled={editing !== null}
        >
          <Plus className="h-4 w-4" />
          ويب هوك جديد
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}

      {/* محرر إنشاء/تحرير ويب هوك */}
      {editing !== null && (
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Webhook className="h-5 w-5" />
            {editing === "new" ? "ويب هوك جديد" : `تحرير: ${editing.name}`}
          </h2>

          <div>
            <Label htmlFor="hw-name">اسم الويب هوك (داخلي)</Label>
            <Input
              id="hw-name"
              className="mt-1.5"
              placeholder="مثال: طلبات المتجر"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="hw-workflow">سير العمل المرتبط (اختياري)</Label>
            <select
              id="hw-workflow"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              className={selectClass}
            >
              <option value="">بدون سير عمل</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="hw-tag">وسم تلقائي لجهة الاتصال (اختياري)</Label>
            <Input
              id="hw-tag"
              className="mt-1.5"
              placeholder="مثال: متجر-إلكتروني"
              value={autoTag}
              onChange={(e) => setAutoTag(e.target.value)}
            />
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

      {/* شرح شكل الحمولة للمرسل الخارجي */}
      <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
        <h3 className="text-sm font-semibold">شكل الطلب المتوقع من النظام الخارجي</h3>
        <p className="text-sm text-muted-foreground">
          أرسل طلب POST بالحقول التالية — الحقل <code dir="ltr">phone</code>{" "}
          إلزامي، وإن غاب يُتجاهل الحدث دون فتح محادثة:
        </p>
        <pre dir="ltr" className="overflow-x-auto rounded-md bg-background p-3 text-xs">
{`{
  "phone": "9665xxxxxxxx",   // رقم العميل (إلزامي)
  "name": "اسم العميل",      // اختياري
  "message": "طلب جديد #1234", // اختياري — نص يظهر في المحادثة
  "tag": "متجر"              // وسم إضافي لجهة الاتصال — اختياري
}`}
        </pre>
      </div>

      {/* قائمة الويب هوك */}
      {webhooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد ويب هوك بعد — أنشئ أول رابط لاستقبال أحداث من متجرك أو نظام الطلبات
        </p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((w) => (
            <div key={w.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{w.name}</span>
                  <Badge variant={w.isActive ? "success" : "outline"}>
                    {w.isActive ? "نشط" : "متوقف"}
                  </Badge>
                  {w.autoTag && <Badge variant="secondary">{w.autoTag}</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  آخر استدعاء: {w.lastHitAt ? relativeTime(w.lastHitAt) : "—"}
                </span>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                {w.workflowId
                  ? `سير العمل: ${workflows.find((f) => f.id === w.workflowId)?.name ?? "غير موجود"}`
                  : "بدون سير عمل"}
              </p>

              <div className="mt-2 flex items-center gap-2" dir="ltr">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">
                  {origin ? receiverUrl(w) : `/api/hooks/${w.token}`}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyUrl(w)}
                  disabled={!origin}
                >
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
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
