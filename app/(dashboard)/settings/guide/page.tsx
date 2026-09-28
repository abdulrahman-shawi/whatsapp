import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, BookOpen, ExternalLink } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MockScreenshot, Hl, Bar, MockButton, MockField } from "@/components/settings/guide-mock";
import { CopyCommand } from "@/components/settings/copy-command";

export const dynamic = "force-dynamic";

// رابط خارجي يفتح في تبويب جديد
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

// تنبيه كهرماني هادئ
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

// خطوات مرقّمة بالعربية
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-2 ps-5 text-sm leading-7 marker:font-bold marker:text-primary">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

const SECTIONS = [
  { id: "openai", label: "مفتاح OpenAI" },
  { id: "whatsapp", label: "مفاتيح واتساب (٤)" },
  { id: "pusher", label: "مفاتيح Pusher (٤)" },
  { id: "database", label: "قاعدة البيانات" },
  { id: "secrets", label: "الأسرار المولّدة ذاتياً" },
];

// دليل مصوّر لاستخراج كل مفاتيح المنصة خطوة بخطوة
export default async function GuidePage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">دليل استخراج المفاتيح خطوة بخطوة</h1>
        <p className="text-sm text-muted-foreground">
          شرح مصوّر مفصّل للحصول على كل مفتاح تحتاجه المنصة — بعد استخراج أي
          مفتاح الصقه في{" "}
          <Link href="/settings" className="text-primary hover:underline">
            صفحة الإعدادات
          </Link>
        </p>
      </div>

      {/* فهرس الأقسام — ثابت أعلى الصفحة عند التمرير */}
      <div className="sticky top-0 z-10 -mx-2 bg-background/95 px-2 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm">
          <BookOpen className="h-4 w-4 text-primary" />
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>

      {/* ١. مفتاح OpenAI */}
      <Card id="openai" className="scroll-mt-20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">١. مفتاح OpenAI</CardTitle>
            <Badge variant="outline" dir="ltr">OPENAI_API_KEY</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Steps
            items={[
              <>
                ادخل <ExtLink href="https://platform.openai.com">platform.openai.com</ExtLink>{" "}
                وسجّل دخولك (أو أنشئ حساباً جديداً).
              </>,
              <>
                من القائمة الجانبية اختر «API keys» (أو Settings ثم API keys).
              </>,
              <>
                اضغط «Create new secret key»، سمّها (مثلاً whatsapp-saas) ثم اضغط Create.
              </>,
              <>
                انسخ المفتاح فوراً — يظهر مرة واحدة فقط ويبدأ بـ <code dir="ltr">sk-</code>.
              </>,
            ]}
          />
          <MockScreenshot title="platform.openai.com/api-keys">
            <div className="flex gap-3">
              {/* القائمة الجانبية */}
              <div className="w-28 space-y-2 border-e pe-2">
                <Bar className="w-16" />
                <Bar className="w-20" />
                <Hl label="اختر API keys">
                  <span className="block rounded bg-accent px-2 py-1 text-[10px] font-medium text-accent-foreground">
                    API keys
                  </span>
                </Hl>
                <Bar className="w-14" />
              </div>
              {/* المحتوى */}
              <div className="flex-1 space-y-2">
                <Bar className="w-32" />
                <Bar className="w-full" />
                <div className="pt-2 text-left">
                  <Hl label="اضغط هنا">
                    <MockButton>Create new secret key</MockButton>
                  </Hl>
                </div>
              </div>
            </div>
          </MockScreenshot>
          <Callout>
            الردود الذكية لن تعمل دون رصيد مدفوع — من Billing ← Add payment
            method أضف بطاقة واشحن ٥$ مثلاً تكفي لآلاف الرسائل.
          </Callout>
        </CardContent>
      </Card>

      {/* ٢. مفاتيح واتساب */}
      <Card id="whatsapp" className="scroll-mt-20">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">٢. مفاتيح واتساب (٤ مفاتيح)</CardTitle>
            <Badge variant="outline" dir="ltr">WHATSAPP_TOKEN</Badge>
            <Badge variant="outline" dir="ltr">WHATSAPP_PHONE_NUMBER_ID</Badge>
            <Badge variant="outline" dir="ltr">META_APP_SECRET</Badge>
            <Badge variant="outline" dir="ltr">WHATSAPP_VERIFY_TOKEN</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* الخطوة أ */}
          <div>
            <h3 className="mb-2 font-bold text-primary">الخطوة أ: إنشاء تطبيق Meta</h3>
            <Steps
              items={[
                <>
                  ادخل{" "}
                  <ExtLink href="https://developers.facebook.com">developers.facebook.com</ExtLink>{" "}
                  وسجّل دخولك بحساب فيسبوك.
                </>,
                <>
                  من My Apps اضغط «Create App» واختر نوع «Business» (أو Other ثم
                  Business) وأكمل الاسم والبريد.
                </>,
              ]}
            />
          </div>

          {/* الخطوة ب */}
          <div>
            <h3 className="mb-2 font-bold text-primary">الخطوة ب: تفعيل منتج واتساب</h3>
            <Steps
              items={[
                <>
                  من لوحة التطبيق ابحث عن «WhatsApp» في قائمة المنتجات واضغط «Set up».
                </>,
              ]}
            />
          </div>

          {/* الخطوة ج */}
          <div>
            <h3 className="mb-2 font-bold text-primary">
              الخطوة ج: <span dir="ltr">WHATSAPP_PHONE_NUMBER_ID</span> والتوكن المؤقت
            </h3>
            <Steps
              items={[
                <>
                  افتح WhatsApp ← API Setup: ستجد «Temporary access token»
                  (صالح ٢٤ ساعة فقط للتجربة)، وتحت «From» رقم الاختبار، وتحته
                  «Phone number ID» — انسخ Phone number ID.
                </>,
                <>
                  للتجربة: في قسم «To» أضف رقمك الشخصي وتحقق منه برمز SMS —
                  الأرقام غير المسجلة لن تستقبل رسائل في وضع الاختبار.
                </>,
              ]}
            />
            <MockScreenshot title="developers.facebook.com — WhatsApp › API Setup">
              <div className="space-y-2">
                <Bar className="w-40" />
                <MockField label="Temporary access token" value="EAAxxxxx… (صالح ٢٤ ساعة)" />
                <MockField label="From" value="+1 555 000 1234 (رقم اختبار)" />
                <Hl label="انسخ هذا — Phone number ID">
                  <MockField label="Phone number ID" value="109876543210" />
                </Hl>
                <div className="pt-1">
                  <MockField label="To" value="أضف رقمك الشخصي هنا للتجربة" />
                </div>
              </div>
            </MockScreenshot>
          </div>

          {/* الخطوة د */}
          <div>
            <h3 className="mb-2 font-bold text-primary">
              الخطوة د: توكن دائم (<span dir="ltr">WHATSAPP_TOKEN</span>)
            </h3>
            <Callout>
              مهم للإنتاج — التوكن المؤقت ينتهي خلال ٢٤ ساعة. التوكن الدائم من
              System Users لا ينتهي.
            </Callout>
            <Steps
              items={[
                <>
                  ادخل{" "}
                  <ExtLink href="https://business.facebook.com">business.facebook.com</ExtLink>{" "}
                  ← Business Settings ← Users ← System Users ← Add — سمّه واختر دور Admin.
                </>,
                <>
                  اضغط على المستخدم الجديد ← Add Assets ← Apps ← اختر تطبيقك ←
                  فعّل Full control.
                </>,
                <>
                  اضغط Generate New Token ← اختر تطبيقك ← فعّل صلاحيتي{" "}
                  <code dir="ltr">whatsapp_business_messaging</code> و{" "}
                  <code dir="ltr">whatsapp_business_management</code> ← Generate ←
                  انسخ التوكن فوراً — هذا هو WHATSAPP_TOKEN الدائم.
                </>,
              ]}
            />
            <MockScreenshot title="business.facebook.com — System Users › Generate Token">
              <div className="space-y-2">
                <Bar className="w-48" />
                <div className="space-y-1.5 rounded border bg-background p-2">
                  <span className="text-[10px] text-muted-foreground">Available permissions:</span>
                  <Hl label="فعّل الصلاحيتين">
                    <span className="block space-y-1 rounded border bg-background p-1.5">
                      <span className="flex items-center gap-1.5 text-[10px]">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
                        whatsapp_business_messaging
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px]">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
                        whatsapp_business_management
                      </span>
                    </span>
                  </Hl>
                </div>
                <div className="text-left">
                  <MockButton>Generate token</MockButton>
                </div>
              </div>
            </MockScreenshot>
          </div>

          {/* الخطوة هـ */}
          <div>
            <h3 className="mb-2 font-bold text-primary">
              الخطوة هـ: <span dir="ltr">META_APP_SECRET</span>
            </h3>
            <Steps
              items={[
                <>
                  في developers.facebook.com ← تطبيقك ← Settings ← Basic ← ستجد
                  «App Secret» — اضغط Show (ستُطلب كلمة مرور فيسبوك) وانسخه.
                </>,
              ]}
            />
          </div>

          {/* الخطوة و */}
          <div>
            <h3 className="mb-2 font-bold text-primary">
              الخطوة و: <span dir="ltr">WHATSAPP_VERIFY_TOKEN</span> وربط الـ Webhook
            </h3>
            <Steps
              items={[
                <>
                  WHATSAPP_VERIFY_TOKEN ليس من Meta — كلمة سر تخترعها بنفسك
                  (مثلاً my-secret-123) وتكتبها في صفحة الإعدادات هنا أولاً.
                </>,
                <>
                  في Meta: WhatsApp ← Configuration ← في قسم Webhook اضغط Edit ←
                  Callback URL: <code dir="ltr">https://&lt;نطاقك&gt;/api/webhooks/whatsapp</code>{" "}
                  وVerify Token: نفس الكلمة التي اخترتها ← اضغط «Verify and save».
                </>,
                <>
                  في Webhook fields اضغط Manage واشترك (Subscribe) في حقل «messages».
                </>,
                <>
                  للإنتاج: من API Setup اضغط «Add phone number» لإضافة رقمك
                  التجاري الحقيقي (يتطلب توثيق النشاط التجاري).
                </>,
              ]}
            />
            <MockScreenshot title="developers.facebook.com — WhatsApp › Configuration › Webhook">
              <div className="space-y-2">
                <Bar className="w-40" />
                <Hl label="رابط موقعك + /api/webhooks/whatsapp">
                  <MockField label="Callback URL" value="https://your-domain.com/api/webhooks/whatsapp" />
                </Hl>
                <Hl label="نفس الكلمة التي كتبتها في الإعدادات">
                  <MockField label="Verify token" value="my-secret-123" />
                </Hl>
                <div className="text-left">
                  <MockButton>Verify and save</MockButton>
                </div>
                <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground">
                  Webhook fields:
                  <Hl label="اشترك في messages">
                    <span className="rounded border bg-background px-2 py-1">messages — Subscribe</span>
                  </Hl>
                </div>
              </div>
            </MockScreenshot>
            <Callout>
              أثناء التطوير المحلي لن تصلك طلبات Meta على localhost — استخدم
              نفقاً مثل ngrok وضع رابطه مؤقتاً في Callback URL.
            </Callout>
          </div>
        </CardContent>
      </Card>

      {/* ٣. مفاتيح Pusher */}
      <Card id="pusher" className="scroll-mt-20">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">٣. مفاتيح Pusher (٤ مفاتيح)</CardTitle>
            <Badge variant="outline" dir="ltr">PUSHER_APP_ID</Badge>
            <Badge variant="outline" dir="ltr">PUSHER_KEY</Badge>
            <Badge variant="outline" dir="ltr">PUSHER_SECRET</Badge>
            <Badge variant="outline" dir="ltr">PUSHER_CLUSTER</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Steps
            items={[
              <>
                ادخل <ExtLink href="https://pusher.com">pusher.com</ExtLink> وأنشئ
                حساباً مجانياً.
              </>,
              <>من لوحة Channels اضغط «Create app» (أو Get started).</>,
              <>
                سمّ التطبيق واختر أقرب Cluster (مثلاً eu أو ap2) واضغط Create.
              </>,
              <>
                افتح تبويب «App Keys» — ستجد الأربعة معاً: app_id ←
                PUSHER_APP_ID، و key ← PUSHER_KEY، و secret ← PUSHER_SECRET، و
                cluster ← PUSHER_CLUSTER.
              </>,
            ]}
          />
          <MockScreenshot title="dashboard.pusher.com — App Keys">
            <div className="space-y-1.5">
              <Bar className="w-32" />
              <div className="rounded border bg-background p-2">
                <Hl label="الحقول الأربعة معاً هنا">
                  <span className="block space-y-1 font-mono text-[10px]">
                    <span className="flex justify-between gap-4">
                      <span className="text-muted-foreground">app_id</span>
                      <span>2030405</span>
                    </span>
                    <span className="flex justify-between gap-4">
                      <span className="text-muted-foreground">key</span>
                      <span>a1b2c3d4e5f6a7b8c9d0</span>
                    </span>
                    <span className="flex justify-between gap-4">
                      <span className="text-muted-foreground">secret</span>
                      <span>z9y8x7w6v5u4t3s2r1q0</span>
                    </span>
                    <span className="flex justify-between gap-4">
                      <span className="text-muted-foreground">cluster</span>
                      <span>eu</span>
                    </span>
                  </span>
                </Hl>
              </div>
            </div>
          </MockScreenshot>
          <Callout>
            Pusher اختياري — بدونه يعمل صندوق الوارد بالتحديث الدوري كل بضع
            ثوانٍ بدل الفوري.
          </Callout>
        </CardContent>
      </Card>

      {/* ٤. قاعدة البيانات */}
      <Card id="database" className="scroll-mt-20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">٤. قاعدة البيانات (عبر Neon)</CardTitle>
            <Badge variant="outline" dir="ltr">DATABASE_URL</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Steps
            items={[
              <>
                ادخل <ExtLink href="https://neon.tech">neon.tech</ExtLink> وأنشئ
                حساباً ثم اضغط «Create a project».
              </>,
              <>سمّ المشروع واختر المنطقة الأقرب لك ثم اضغط Create.</>,
              <>
                انسخ «Connection string» — تبدأ بـ <code dir="ltr">postgresql://</code>{" "}
                (اختر Pooled connection للأداء الأفضل).
              </>,
              <>
                محلياً نفّذ الأمرين التاليين لإنشاء الجداول ثم البيانات التجريبية:
              </>,
            ]}
          />
          <CopyCommand command='DATABASE_URL="<الرابط الذي نسخته>" npm run db:push' />
          <CopyCommand command="npm run db:seed" />
          <MockScreenshot title="console.neon.tech — Connection Details">
            <div className="space-y-2">
              <Bar className="w-40" />
              <Hl label="انسخ الرابط كاملاً">
                <MockField
                  label="Connection string"
                  value="postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require"
                />
              </Hl>
              <span className="inline-block rounded border bg-background px-2 py-1 text-[10px]">
                ☑ Pooled connection
              </span>
            </div>
          </MockScreenshot>
          <Callout>
            قاعدة localhost على جهازك لا تعمل من Vercel — في الإنتاج يجب قاعدة
            سحابية مثل Neon.
          </Callout>
        </CardContent>
      </Card>

      {/* ٥. الأسرار المولّدة ذاتياً */}
      <Card id="secrets" className="scroll-mt-20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">٥. الأسرار المولّدة ذاتياً</CardTitle>
            <Badge variant="outline" dir="ltr">NEXTAUTH_SECRET</Badge>
            <Badge variant="outline" dir="ltr">CRON_SECRET</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-7">
            هذان السرّان لا يُستخرجان من أي موقع — ولّدهما بنفسك في الطرفية.
            نفّذ الأمر مرة لكل سر (ولّد سرين مختلفين):
          </p>
          <CopyCommand command="openssl rand -base64 32" />
          <p className="mt-2 text-sm text-muted-foreground">
            أو باستخدام Node.js إن لم يكن openssl متوفراً:
          </p>
          <CopyCommand command='node -e "console.log(crypto.randomBytes(32).toString(&quot;base64&quot;))"' />
          <p className="mt-2 text-sm text-muted-foreground">
            انسخ الناتج والصقه في صفحة الإعدادات أو ملف .env لكل من NEXTAUTH_SECRET
            و CRON_SECRET.
          </p>
        </CardContent>
      </Card>

      {/* رابط العودة */}
      <div className="pb-6">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى صفحة الإعدادات للصق المفاتيح
        </Link>
      </div>
    </div>
  );
}
