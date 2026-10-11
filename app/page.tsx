import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowLeft,
  Bot,
  CalendarDays,
  Check,
  LayoutDashboard,
  Megaphone,
  Workflow,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePlansSeeded } from "@/lib/billing/plans";
import { stripeConfigured } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

// صفحة الهبوط العامة: تسويق المنتج والباقات — بوابة الاشتراك الذاتي (SaaS)
// العميل يختار باقة ← يسجّل معلوماته ← يدفع (إن كانت مدفوعة) ← تُنشأ مساحة عمله تلقائياً
export default async function LandingPage() {
  const [session, plans] = await Promise.all([
    getServerSession(authOptions),
    (async () => {
      await ensurePlansSeeded();
      return prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
    })(),
  ]);
  const paidEnabled = stripeConfigured();

  const features = [
    {
      icon: Bot,
      title: "ردّ آلي بالذكاء الاصطناعي",
      description: "وكيل ذكي يرد على عملائك في واتساب على مدار الساعة ويحوّل للموظف عند الحاجة",
    },
    {
      icon: Workflow,
      title: "سير عمل وأتمتة",
      description: "منشئ تدفقات شبيه بـ n8n: شروط، إسناد، وسوم، حظر، وويب هوكات صادرة وواردة",
    },
    {
      icon: Megaphone,
      title: "حملات بث جماعي",
      description: "أرسل عروضك لشرائح عملائك مع اختبار A/B وتتبّع النقرات والتحويل",
    },
    {
      icon: CalendarDays,
      title: "حجوزات ونماذج عملاء",
      description: "نماذج مخصّصة تولّد عملاء محتملين تلقائياً مع نقاط تقييم الجودة",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* الترويسة */}
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-primary">ردّ</h1>
          <nav className="flex items-center gap-2">
            {session ? (
              <Button asChild>
                <Link href="/inbox">
                  <LayoutDashboard className="h-4 w-4" />
                  لوحة التحكم
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">تسجيل الدخول</Link>
                </Button>
                <Button asChild>
                  <Link href="/register">ابدأ الآن</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* البطل */}
      <section className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h2 className="text-4xl font-extrabold leading-tight">
          منصّة واتساب الذكية لنشاطك التجاري
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          ردّ آلي بالذكاء الاصطناعي، حملات، حجوزات، وسير عمل مؤتمت — كل ما يحتاجه
          متجرك في مكان واحد. اشترك خلال دقائق واحصل على مساحة عمل خاصة بك فوراً.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="#pricing">
              اطّلع على الباقات
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* المزايا */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader className="pb-2">
                <f.icon className="h-6 w-6 text-primary" />
                <CardTitle className="text-base">{f.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{f.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* الباقات */}
      <section id="pricing" className="border-t bg-muted/30 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h3 className="text-center text-2xl font-bold">باقات الاشتراك</h3>
          <p className="mt-2 text-center text-muted-foreground">
            اختر الباقة المناسبة — تُنشأ مساحة عملك تلقائياً فور التسجيل، وتُفعَّل
            الباقة المدفوعة مباشرة بعد إتمام الدفع
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const free = plan.priceMonthly === 0;
              const popular = plan.code === "PRO";
              return (
                <Card
                  key={plan.code}
                  className={popular ? "border-primary ring-2 ring-primary/30" : ""}
                >
                  <CardHeader>
                    {popular && (
                      <span className="mb-1 w-fit rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        الأكثر اختياراً
                      </span>
                    )}
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>
                      <span className="text-3xl font-bold text-foreground">
                        ${plan.priceMonthly}
                      </span>{" "}
                      / شهرياً
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-center gap-1.5">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        {plan.messageLimit.toLocaleString("en")} رسالة شهرياً
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        {(plan.tokenLimit / 1_000_000).toLocaleString("en")} مليون توكن ذكاء اصطناعي
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        حتى {plan.maxMembers} أعضاء في الفريق
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        حتى {plan.maxAgents} وكلاء ذكاء اصطناعي
                      </li>
                    </ul>
                    <Button
                      className="w-full"
                      variant={popular ? "default" : "outline"}
                      asChild
                    >
                      <Link href={`/register?plan=${plan.code}`}>
                        {free ? "ابدأ مجاناً" : "اشترك الآن"}
                      </Link>
                    </Button>
                    {!free && !paidEnabled && (
                      <p className="text-center text-xs text-muted-foreground">
                        الدفع الإلكتروني قيد التفعيل — اشترك وسنتواصل معك
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        ردّ — منصّة الرد الآلي الذكي لواتساب
      </footer>
    </div>
  );
}
