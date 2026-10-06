"use client";

import { useState } from "react";
import { Check, Crown, Loader2, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PlanItem = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  messageLimit: number;
  tokenLimit: number;
  maxMembers: number;
  maxAgents: number;
};

type Usage = { used: number; limit: number; remaining: number; percent: number };

// صفحة الاشتراك: الباقة الحالية، شبكة الباقات، ولوحة مدير المنصة للتفعيل اليدوي
export function BillingClient({
  currentPlan,
  plans,
  usage,
  isAdmin,
  supportWhatsapp,
}: {
  currentPlan: PlanItem;
  plans: PlanItem[];
  usage: Usage;
  isAdmin: boolean;
  supportWhatsapp: string;
}) {
  const [adminPlan, setAdminPlan] = useState(currentPlan.code);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const barColor =
    usage.percent >= 95
      ? "bg-red-400"
      : usage.percent >= 80
        ? "bg-amber-400"
        : "bg-primary";

  // رابط طلب الترقية عبر واتساب لمالك المنصة
  const upgradeHref = supportWhatsapp
    ? `https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(
        `مرحباً، أرغب بترقية باقة مساحة عملي من (${currentPlan.name}) إلى باقة أعلى`
      )}`
    : undefined;

  async function handleAssignPlan() {
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode: adminPlan }),
    });
    setSaving(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error ?? "حدث خطأ أثناء التعيين");
      return;
    }
    setMessage("تم تعيين الباقة — حدّث الصفحة لرؤية التغيير");
  }

  return (
    <div className="space-y-6">
      {/* الباقة الحالية */}
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Crown className="h-5 w-5 text-primary" />
            باقتك الحالية: {currentPlan.name}
          </h2>
          <Badge variant={currentPlan.priceMonthly > 0 ? "default" : "secondary"}>
            {currentPlan.priceMonthly > 0
              ? `$${currentPlan.priceMonthly} / شهر`
              : "مجانية"}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          استهلاك الشهر: {usage.used} / {usage.limit} رسالة ({usage.percent}٪)
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${usage.percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          الرسائل المتبقية: {usage.remaining} — تُجدَّد في أول الشهر القادم
        </p>
      </div>

      {/* شبكة الباقات */}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.code === currentPlan.code;
          return (
            <div
              key={p.id}
              className={cn(
                "flex flex-col rounded-lg border p-4",
                isCurrent && "border-primary bg-accent/40"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{p.name}</h3>
                {isCurrent && (
                  <Badge variant="outline">
                    <Check className="h-3 w-3" />
                    الحالية
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-2xl font-bold">
                {p.priceMonthly > 0 ? `$${p.priceMonthly}` : "مجاناً"}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / شهر
                </span>
              </p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm text-muted-foreground">
                <li>{p.messageLimit.toLocaleString("en")} رسالة شهرياً</li>
                <li>
                  {p.tokenLimit.toLocaleString("en")} توكن ذكاء اصطناعي شهرياً
                </li>
                <li>حتى {p.maxMembers} أعضاء في الفريق</li>
                <li>حتى {p.maxAgents} وكلاء ذكيين</li>
                <li>ردود الفريق اليدوية غير محدودة</li>
              </ul>
              {!isCurrent && upgradeHref && (
                <Button className="mt-4" variant="outline" asChild>
                  <a href={upgradeHref} target="_blank" rel="noreferrer">
                    <Rocket className="h-4 w-4" />
                    اطلب الترقية
                  </a>
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {!upgradeHref && (
        <p className="text-xs text-muted-foreground">
          لطلب الترقية تواصل مع مالك المنصة — لضبط رابط واتساب التواصل أضف
          NEXT_PUBLIC_SUPPORT_WHATSAPP في ملف .env
        </p>
      )}

      {/* لوحة مدير المنصة: التفعيل اليدوي للباقات */}
      {isAdmin && (
        <div className="rounded-lg border border-dashed p-4">
          <h2 className="font-semibold">لوحة مدير المنصة (التفعيل اليدوي)</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            عند استلام الدفع من العميل، عيّن باقته هنا — يُطبق الحد الجديد فوراً
          </p>
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="admin-plan">باقة مساحة العمل الحالية</Label>
              <select
                id="admin-plan"
                value={adminPlan}
                onChange={(e) => setAdminPlan(e.target.value)}
                className="mt-1.5 flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name} — ${p.priceMonthly}/شهر
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={handleAssignPlan} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              تعيين
            </Button>
          </div>
          {message && (
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          )}
        </div>
      )}
    </div>
  );
}
