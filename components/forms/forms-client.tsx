"use client";

import { useState } from "react";
import {
  ClipboardCopy,
  Code2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_STAGES } from "@/lib/contact-stages";
import type { LeadFormField } from "@/lib/lead-forms";
import { relativeTime } from "@/lib/time";

type Form = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  fields: LeadFormField[];
  autoTag: string;
  autoStage: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const FIELD_TYPE_LABELS: Record<LeadFormField["type"], string> = {
  text: "نص",
  phone: "جوال",
  textarea: "نص طويل",
};

const selectClass =
  "mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// نماذج استقبال العملاء: إنشاء نموذج عام وإدارته ونسخ رابطه ورمز تضمينه
export function FormsClient({ initialForms }: { initialForms: Form[] }) {
  const [forms, setForms] = useState<Form[]>(initialForms);
  const [editing, setEditing] = useState<Form | "new" | null>(null);

  // حقول النموذج أثناء الإنشاء/التحرير
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [autoTag, setAutoTag] = useState("");
  const [autoStage, setAutoStage] = useState("");
  const [fields, setFields] = useState<LeadFormField[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(form: Form | "new") {
    setEditing(form);
    setError("");
    setNotice("");
    if (form === "new") {
      setName("");
      setTitle("");
      setDescription("");
      setAutoTag("");
      setAutoStage("");
      setFields([
        { label: "الاسم", type: "text", required: true },
        { label: "رقم الجوال", type: "phone", required: true },
      ]);
    } else {
      setName(form.name);
      setTitle(form.title);
      setDescription(form.description ?? "");
      setAutoTag(form.autoTag);
      setAutoStage(form.autoStage ?? "");
      setFields(form.fields);
    }
  }

  function validateDraft(): string {
    if (!name.trim()) return "اسم النموذج مطلوب";
    if (autoTag.trim().length > 40) return "الوسم التلقائي حتى ٤٠ حرفاً";
    if (fields.length === 0) return "أضف حقلاً واحداً على الأقل";
    for (const f of fields) {
      if (!f.label.trim() || f.label.trim().length > 60) {
        return "عنوان كل حقل بين ١ و٦٠ حرفاً";
      }
    }
    if (!fields.some((f) => f.type === "phone" && f.required)) {
      return "النموذج يحتاج حقل جوال واحداً على الأقل (مطلوب)";
    }
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
      title: title.trim() || undefined,
      description: description.trim() || null,
      autoTag: autoTag.trim(),
      autoStage: autoStage || null,
      fields: fields.map((f) => ({
        label: f.label.trim(),
        type: f.type,
        required: f.required,
      })),
    };
    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/forms" : `/api/forms/${(editing as Form).id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.form) {
      setError(data?.error ?? "حدث خطأ أثناء حفظ النموذج");
      return;
    }
    const saved: Form = {
      ...data.form,
      createdAt: data.form.createdAt,
      updatedAt: data.form.updatedAt,
    };
    setForms((prev) =>
      isNew ? [saved, ...prev] : prev.map((f) => (f.id === saved.id ? saved : f))
    );
    setEditing(null);
  }

  async function handleToggle(form: Form) {
    setBusyId(form.id);
    setError("");
    const res = await fetch(`/api/forms/${form.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !form.isActive }),
    });
    setBusyId(null);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.form) {
      setError(data?.error ?? "حدث خطأ أثناء تغيير الحالة");
      return;
    }
    setForms((prev) => prev.map((f) => (f.id === form.id ? data.form : f)));
  }

  async function handleDelete(form: Form) {
    if (!window.confirm(`حذف النموذج "${form.name}" نهائياً؟`)) return;
    setBusyId(form.id);
    setError("");
    const res = await fetch(`/api/forms/${form.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء الحذف");
      return;
    }
    setForms((prev) => prev.filter((f) => f.id !== form.id));
    if (editing !== "new" && editing?.id === form.id) setEditing(null);
  }

  function copyText(text: string, label: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setNotice(label);
        setTimeout(() => setNotice(""), 3000);
      })
      .catch(() => setError("تعذر النسخ — انسخ الرابط يدوياً"));
  }

  function formUrl(id: string) {
    return `${window.location.origin}/form/${id}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">النماذج ({forms.length})</h2>
        <Button
          size="sm"
          onClick={() => startEdit("new")}
          disabled={editing !== null}
        >
          <Plus className="h-4 w-4" />
          نموذج جديد
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}

      {/* محرر إنشاء/تحرير نموذج */}
      {editing !== null && (
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Pencil className="h-5 w-5" />
            {editing === "new" ? "نموذج جديد" : `تحرير: ${editing.name}`}
          </h2>

          <div>
            <Label htmlFor="lf-name">اسم النموذج (داخلي)</Label>
            <Input
              id="lf-name"
              className="mt-1.5"
              placeholder="مثال: نموذج حملة الصيف"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="lf-title">عنوان الصفحة العامة</Label>
            <Input
              id="lf-title"
              className="mt-1.5"
              placeholder="تواصل معنا"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="lf-desc">وصف تحت العنوان (اختياري)</Label>
            <Textarea
              id="lf-desc"
              rows={2}
              className="mt-1.5"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="lf-tag">وسم تلقائي لجهة الاتصال (اختياري)</Label>
            <Input
              id="lf-tag"
              className="mt-1.5"
              placeholder="مثال: حملة-الصيف"
              value={autoTag}
              onChange={(e) => setAutoTag(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="lf-stage">المرحلة الافتراضية للعميل الجديد</Label>
            <select
              id="lf-stage"
              value={autoStage}
              onChange={(e) => setAutoStage(e.target.value)}
              className={selectClass}
            >
              <option value="">بدون تغيير</option>
              {CONTACT_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>حقول النموذج</Label>
            {fields.map((f, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-md border p-2"
              >
                <div className="min-w-32 flex-1">
                  <Input
                    value={f.label}
                    placeholder="عنوان الحقل"
                    onChange={(e) =>
                      setFields((prev) =>
                        prev.map((p, j) =>
                          j === i ? { ...p, label: e.target.value } : p
                        )
                      )
                    }
                  />
                </div>
                <select
                  value={f.type}
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((p, j) =>
                        j === i
                          ? { ...p, type: e.target.value as LeadFormField["type"] }
                          : p
                      )
                    )
                  }
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      setFields((prev) =>
                        prev.map((p, j) =>
                          j === i ? { ...p, required: e.target.checked } : p
                        )
                      )
                    }
                  />
                  مطلوب
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setFields((prev) => prev.filter((_, j) => j !== i))
                  }
                  disabled={fields.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setFields((prev) => [
                  ...prev,
                  { label: "", type: "text", required: false },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              إضافة حقل
            </Button>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "جارٍ الحفظ…" : "حفظ النموذج"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {/* قائمة النماذج */}
      {forms.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد نماذج بعد — أنشئ أول نموذج لاستقبال عملاء جدد من موقعك
        </p>
      ) : (
        <div className="space-y-2">
          {forms.map((f) => (
            <div key={f.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{f.name}</span>
                  <Badge variant={f.isActive ? "success" : "outline"}>
                    {f.isActive ? "فعّال" : "موقوف"}
                  </Badge>
                  {f.autoTag && <Badge variant="secondary">{f.autoTag}</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(
                    typeof f.createdAt === "string"
                      ? f.createdAt
                      : f.createdAt.toISOString()
                  )}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {f.title} — {f.fields.length} حقول
                {f.autoStage &&
                  ` — المرحلة: ${CONTACT_STAGES.find((s) => s.value === f.autoStage)?.label ?? f.autoStage}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyText(formUrl(f.id), "تم نسخ الرابط")}
                >
                  <ClipboardCopy className="h-4 w-4" />
                  نسخ الرابط
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copyText(
                      `<iframe src="${formUrl(f.id)}" style="width:100%;height:600px;border:0"></iframe>`,
                      "تم نسخ رمز التضمين"
                    )
                  }
                >
                  <Code2 className="h-4 w-4" />
                  رمز تضمين
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(f)}
                  disabled={editing !== null}
                >
                  <Pencil className="h-4 w-4" />
                  تحرير
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggle(f)}
                  disabled={busyId === f.id}
                >
                  {f.isActive ? "إيقاف" : "تفعيل"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(f)}
                  disabled={busyId === f.id}
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
