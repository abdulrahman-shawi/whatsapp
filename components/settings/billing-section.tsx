import Link from "next/link";
import { PartyPopper, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  ensurePlansSeeded,
  getUsageStatus,
  getWorkspacePlan,
  getWorkspaceTrialStatus,
} from "@/lib/billing/plans";
import { stripeConfiguredAsync } from "@/lib/stripe";
import { getPlatformConfig } from "@/lib/platform-config";
import { BillingClient } from "@/components/billing/billing-client";

// بريدات مالك المنصة من .env — مفصولة بفواصل
function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// قسم الاشتراك داخل الإعدادات: الباقة الحالية والباقات المتاحة وطلب الترقية
export async function BillingSection({
  workspaceId,
  userId,
  success,
  canceled,
}: {
  workspaceId: string;
  userId: string;
  success?: boolean;
  canceled?: boolean;
}) {
  await ensurePlansSeeded();
  const [currentPlan, usage, plans, user, trial] = await Promise.all([
    getWorkspacePlan(workspaceId),
    getUsageStatus(workspaceId),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    getWorkspaceTrialStatus(workspaceId),
  ]);

  const isAdmin = !!user && adminEmails().includes(user.email.toLowerCase());

  return (
    <div className="max-w-3xl space-y-6">
      {trial.active && trial.endsAt && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          أنت في التجربة المجانية لباقة {currentPlan.name}. تنتهي في{" "}
          {new Intl.DateTimeFormat("ar", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(trial.endsAt)}{" "}
         ؛ بعد ذلك تصبح مساحة العمل للقراءة فقط حتى تفعيل اشتراك.
        </div>
      )}
      {trial.expired && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          انتهت التجربة المجانية. مساحة العمل للقراءة فقط؛ اختر باقة مدفوعة من
          الخيارات أدناه لاستعادة إرسال الرسائل والذكاء الاصطناعي.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          باقتك الحالية وحدودها، والباقات المتاحة للترقية
        </p>
        <Link
          href="/invoices"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          عرض الفواتير
        </Link>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <PartyPopper className="h-4 w-4 shrink-0" />
          تم تفعيل باقتك بنجاح 🎉
        </div>
      )}
      {canceled && (
        <div className="flex items-center gap-2 rounded-lg border border-muted bg-accent/40 px-4 py-3 text-sm text-muted-foreground">
          <XCircle className="h-4 w-4 shrink-0" />
          تم إلغاء إتمام الدفع
        </div>
      )}

      <BillingClient
        currentPlan={currentPlan}
        plans={plans}
        usage={usage}
        isAdmin={isAdmin}
        supportWhatsapp={(await getPlatformConfig()).SUPPORT_WHATSAPP}
        stripeConfigured={await stripeConfiguredAsync()}
      />
    </div>
  );
}
