"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS: { key: string; label: string; hint: string; secret: boolean }[] = [
  {
    key: "STRIPE_SECRET_KEY",
    label: "المفتاح السري لـ Stripe",
    hint: "sk_live_... أو sk_test_... — يُستخدم لإنشاء جلسات الدفع",
    secret: true,
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    label: "سر ويب هوك Stripe",
    hint: "whsec_... — من إعداد webhook في لوحة Stripe",
    secret: true,
  },
  {
    key: "STRIPE_PRICE_STARTER",
    label: "معرّف سعر الباقة الأساسية",
    hint: "price_... (اتركه فارغاً لتبقى مجانية)",
    secret: false,
  },
  {
    key: "STRIPE_PRICE_PRO",
    label: "معرّف سعر الباقة الاحترافية",
    hint: "price_...",
    secret: false,
  },
  {
    key: "STRIPE_PRICE_BUSINESS",
    label: "معرّف سعر باقة الأعمال",
    hint: "price_...",
    secret: false,
  },
  {
    key: "SUPPORT_WHATSAPP",
    label: "رقم واتساب الدعم",
    hint: "يظهر للعملاء في صفحة الاشتراك عند الحاجة للتواصل",
    secret: false,
  },
];

// نموذج إعدادات المنصة — الحقول تُعرض مقنّعة وتُرسل فقط القيم المدخلة
// الحقل الفارغ يعني: لا تغيير (أو احذف القيمة لتعود لمتغير البيئة عند الحفظ الفارغ صراحة)
export function AdminConfigForm() {
  const [masked, setMasked] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.config) setMasked(data.config);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    // نرسل فقط الحقول المدخلة — المقنّع لا يُعاد أبداً
    const payload = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v.trim() !== "")
    );
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setMessage({ ok: true, text: "تم حفظ الإعدادات — أصبحت فعّالة فوراً" });
        setValues({});
        const refreshed = await fetch("/api/admin/config").then((r) =>
          r.ok ? r.json() : null
        );
        if (refreshed?.config) setMasked(refreshed.config);
      } else {
        setMessage({ ok: false, text: data?.error ?? "تعذّر الحفظ" });
      }
    } catch {
      setMessage({ ok: false, text: "تعذّر الحفظ" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>إعدادات المنصة</CardTitle>
        <CardDescription>
          مفاتيح Stripe ورقم الدعم — تتقدّم هذه القيم على متغيرات البيئة في كل
          المسارات (الدفع، الويب هوك، صفحات الاشتراك). اترك الحقل فارغاً للإبقاء
          على القيمة الحالية.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                dir="ltr"
                className="text-left"
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                placeholder={masked[f.key] || "غير مضبوط"}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            </div>
          ))
        )}
        {message && (
          <p
            className={`text-sm ${message.ok ? "text-emerald-600" : "text-destructive"}`}
            role="alert"
          >
            {message.text}
          </p>
        )}
        <Button onClick={handleSave} disabled={saving || loading} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ الإعدادات
        </Button>
      </CardContent>
    </Card>
  );
}
