"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// صفحة إنشاء حساب جديد — بعد النجاح نسجّل الدخول تلقائياً
// مع ?invite= تعرض بيانات الدعوة وتنضم لمساحة العمل الداعية بدل إنشاء مساحة جديدة
export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // باقة مختارة من صفحة الهبوط ?plan= — المدفوعة توجّه لـ Stripe بعد التسجيل
  const planCode = searchParams.get("plan")?.trim().toUpperCase() ?? null;
  const [planInfo, setPlanInfo] = useState<{
    code: string;
    name: string;
    priceMonthly: number;
  } | null>(null);
  // بيانات الدعوة المعروضة في الشارة
  const [inviteInfo, setInviteInfo] = useState<{
    workspaceName: string;
    role: string;
  } | null>(null);
  const [inviteInvalid, setInviteInvalid] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/invites/${inviteToken}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setInviteInfo(data);
        } else {
          setInviteInvalid(true);
        }
      })
      .catch(() => setInviteInvalid(true));
  }, [inviteToken]);

  // جلب اسم الباقة المختارة لعرضها في الشارة
  useEffect(() => {
    if (!planCode) return;
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const found = data?.plans?.find((p: { code: string }) => p.code === planCode);
        if (found) setPlanInfo(found);
      })
      .catch(() => {});
  }, [planCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, inviteToken, workspaceName }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setLoading(false);
      setError(data?.error ?? "حدث خطأ أثناء إنشاء الحساب");
      return;
    }

    // تسجيل دخول تلقائي بعد إنشاء الحساب
    const login = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (login?.error) {
      setLoading(false);
      router.push("/login");
      return;
    }

    // باقة مدفوعة مختارة: ننشئ جلسة Stripe ونحوّل العميل لإتمام الدفع
    // — تُفعَّل الباقة تلقائياً عبر webhook النجاح ثم يعود لصفحة الإعدادات
    if (planInfo && planInfo.priceMonthly > 0) {
      const checkout = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: planInfo.code }),
      });
      if (checkout.ok) {
        const data = await checkout.json().catch(() => null);
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
      }
      // تعذّر إنشاء جلسة الدفع: ندخل المساحة مع تنبيه لإتمام الاشتراك لاحقاً
      setLoading(false);
      setError("تم إنشاء حسابك — يمكنك إتمام الاشتراك لاحقاً من الإعدادات ← الاشتراك والباقات");
      router.push("/settings");
      router.refresh();
      return;
    }

    setLoading(false);
    router.push("/inbox");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">إنشاء حساب</CardTitle>
          <CardDescription>
            {inviteInfo
              ? "انضم إلى فريقك عبر رابط الدعوة"
              : "ابدأ بإعداد مساحة العمل الخاصة بك"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* شارة الدعوة */}
          {inviteInfo && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-accent/50 p-3 text-sm">
              <UserPlus className="h-5 w-5 shrink-0 text-primary" />
              <span>
                دعوة للانضمام إلى <strong>{inviteInfo.workspaceName}</strong> بدور{" "}
                <strong>{inviteInfo.role === "OWNER" ? "مالك" : "موظف"}</strong>
              </span>
            </div>
          )}
          {/* شارة الباقة المختارة من صفحة الهبوط */}
          {planInfo && !inviteInfo && (
            <div className="mb-4 rounded-md border border-primary/30 bg-accent/50 p-3 text-sm">
              الباقة المختارة:{" "}
              <strong>{planInfo.name}</strong>
              {planInfo.priceMonthly > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  — ${planInfo.priceMonthly}/شهرياً، ستُحوَّل لإتمام الدفع بعد إنشاء الحساب
                </span>
              ) : (
                <span className="text-muted-foreground"> — مجانية</span>
              )}
            </div>
          )}
          {inviteInvalid && (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              رابط الدعوة غير صالح أو مستخدم مسبقاً — سيُنشأ لك حساب بمساحة عمل
              جديدة
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                type="text"
                placeholder="اسمك الكامل"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                className="text-left"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {/* اسم النشاط — يُنشأ به مساحة العمل الخاصة بالعميل */}
            {!inviteToken && (
              <div className="space-y-2">
                <Label htmlFor="workspace-name">اسم المتجر أو النشاط</Label>
                <Input
                  id="workspace-name"
                  type="text"
                  placeholder="مثال: متجر الأناقة"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                className="text-left"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "جارٍ الإنشاء…" : inviteInfo ? "قبول الدعوة" : "إنشاء الحساب"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            لديك حساب بالفعل؟{" "}
            <Link href="/login" className="text-primary hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
