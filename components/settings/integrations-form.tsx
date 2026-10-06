"use client";

import { useState } from "react";
import { Check, Eraser, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntegrationInfo } from "@/lib/settings";

// نموذج مفاتيح التكامل: الحقل الفارغ يعني الإبقاء على الحالي أو .env
export function IntegrationsForm({
  integrations,
}: {
  integrations: IntegrationInfo[];
}) {
  // الحقول المعدّلة فقط تُرسل عند الحفظ
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // نتيجة اختبار مفتاح الذكاء الاصطناعي (لحقل OPENAI_API_KEY فقط)
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // اختبار المفتاح المحفوظ حالياً (قاعدة البيانات أو .env) بتوليد قصير
  async function handleTestAi() {
    setTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await fetch("/api/settings/test-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // نختبر ما كُتب في الحقل (حتى قبل الحفظ) — والمحفوظ إن كان فارغاً
        body: JSON.stringify({ apiKey: draft.OPENAI_API_KEY ?? "" }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setAiTestResult({ ok: true, text: `✅ يعمل — ${data.model}: ${data.message}` });
      } else {
        setAiTestResult({ ok: false, text: `❌ ${data?.error ?? "تعذّر الاختبار"}` });
      }
    } catch {
      setAiTestResult({ ok: false, text: "❌ تعذّر الاتصال بالخادم" });
    } finally {
      setTestingAi(false);
    }
  }

  const sourceBadge = (source: IntegrationInfo["source"]) =>
    source === "db" ? (
      <Badge variant="default">من قاعدة البيانات</Badge>
    ) : source === "env" ? (
      <Badge variant="secondary">من .env</Badge>
    ) : (
      <Badge variant="outline">غير مضبوط</Badge>
    );

  // مسح التجاوز المخزن: نرسل القيمة فارغة ليُحذف الصف
  function clearKey(key: string) {
    setDraft((prev) => ({ ...prev, [key]: "" }));
    setCleared((prev) => ({ ...prev, [key]: true }));
  }

  async function handleSave() {
    // لا نرسل الحقول التي لم تُمسّ
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(draft)) {
      if (value !== "" || cleared[key]) payload[key] = value;
    }
    if (Object.keys(payload).length === 0) return;

    setSaving(true);
    setError("");
    setSaved(false);
    const res = await fetch("/api/settings/integrations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء الحفظ");
      return;
    }
    setSaved(true);
    setDraft({});
    setCleared({});
    // تحديث الشارات والقيم المقنّعة من الخادم
    window.location.reload();
  }

  const dirty = Object.entries(draft).some(
    ([k, v]) => v !== "" || cleared[k]
  );

  return (
    <div className="space-y-4">
      {integrations.map((item) => (
        <div key={item.key} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label htmlFor={`key-${item.key}`}>{item.label}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                {item.envName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(item.masked || item.value) && (
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {cleared[item.key]
                    ? "—"
                    : item.options
                      ? item.options.find((o) => o.value === item.value)?.label ??
                        item.value
                      : (item.masked ?? item.value)}
                </span>
              )}
              {cleared[item.key] ? (
                <Badge variant="outline">سيعود إلى .env</Badge>
              ) : (
                sourceBadge(item.source)
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {item.options ? (
              <select
                id={`key-${item.key}`}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={draft[item.key] ?? ""}
                onChange={(e) => {
                  setDraft((prev) => ({ ...prev, [item.key]: e.target.value }));
                  setCleared((prev) => ({ ...prev, [item.key]: false }));
                  setSaved(false);
                }}
              >
                <option value="">
                  {item.value ? "الإبقاء على الحالي" : "الافتراضي: OpenAI"}
                </option>
                {item.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`key-${item.key}`}
                type={item.secret ? "password" : "text"}
                dir="ltr"
                className="text-left"
                placeholder="اتركه فارغاً لاستخدام قيمة .env"
                value={draft[item.key] ?? ""}
                onChange={(e) => {
                  setDraft((prev) => ({ ...prev, [item.key]: e.target.value }));
                  setCleared((prev) => ({ ...prev, [item.key]: false }));
                  setSaved(false);
                }}
              />
            )}
            {item.source === "db" && !cleared[item.key] && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => clearKey(item.key)}
              >
                <Eraser className="h-4 w-4" />
                مسح
              </Button>
            )}
          </div>
          {/* زر اختبار مفتاح الذكاء الاصطناعي + نتيجته */}
          {item.key === "OPENAI_API_KEY" && (
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestAi}
                disabled={testingAi}
              >
                {testingAi ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                اختبار المفتاح الحالي
              </Button>
              {aiTestResult && (
                <p
                  className={`mt-1 text-xs ${aiTestResult.ok ? "text-emerald-600" : "text-destructive"}`}
                  role="alert"
                >
                  {aiTestResult.text}
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}
          حفظ المفاتيح
        </Button>
        {saved && <span className="text-sm text-emerald-600">تم الحفظ</span>}
      </div>
    </div>
  );
}
