"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateInfo } from "@/components/inbox/types";

// إدارة قوالب رسائل واتساب المعتمدة في ميتا
// تُرسل للعملاء خارج نافذة ٢٤ ساعة (initiate conversation)
export function TemplatesForm({
  initialTemplates,
}: {
  initialTemplates: TemplateInfo[];
}) {
  const [templates, setTemplates] = useState<TemplateInfo[]>(initialTemplates);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("ar");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    if (!name.trim() || !body.trim()) {
      setError("اسم القالب ونص المعاينة مطلوبان");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), language, body: body.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء الإضافة");
      return;
    }
    const data = await res.json();
    setTemplates((prev) => [data.template, ...prev]);
    setName("");
    setLanguage("ar");
    setBody("");
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    }
  }

  return (
    <div className="space-y-4">
      {/* نموذج إضافة قالب */}
      <div className="rounded-lg border p-4">
        <Label htmlFor="tpl-name">اسم القالب (كما هو معتمد في ميتا)</Label>
        <Input
          id="tpl-name"
          dir="ltr"
          className="mt-1.5 text-left"
          placeholder="hello_world"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tpl-lang">رمز اللغة</Label>
            <Input
              id="tpl-lang"
              dir="ltr"
              className="mt-1.5 text-left"
              placeholder="ar"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="tpl-body">نص المعاينة — المتغيرات بصيغة {"{{1}}"}</Label>
          <Textarea
            id="tpl-body"
            className="mt-1.5"
            rows={3}
            placeholder="مرحباً {{1}}، شكراً لتواصلك مع {{2}}"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        {error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button className="mt-3" onClick={handleAdd} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <Plus className="h-4 w-4" />
          إضافة القالب
        </Button>
      </div>

      {/* قائمة القوالب */}
      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد قوالب بعد — أضف قالباً معتمداً من لوحة Meta Business
        </p>
      ) : (
        templates.map((t) => (
          <div key={t.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium" dir="ltr">
                  {t.name}
                </span>
                <Badge variant="outline" dir="ltr">
                  {t.language}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                title="حذف القالب"
                onClick={() => handleDelete(t.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {t.body}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
