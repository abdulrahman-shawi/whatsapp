import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  ensurePlansSeeded,
  getUsageStatus,
  getWorkspacePlan,
} from "@/lib/billing/plans";
import { BillingClient } from "@/components/billing/billing-client";

export const dynamic = "force-dynamic";

// بريدات مالك المنصة من .env — مفصولة بفواصل
function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// صفحة الاشتراك: الباقة الحالية والباقات المتاحة وطلب الترقية
export default async function BillingPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  await ensurePlansSeeded();
  const [currentPlan, usage, plans, user] = await Promise.all([
    getWorkspacePlan(ctx.workspaceId),
    getUsageStatus(ctx.workspaceId),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    }),
  ]);

  const isAdmin = !!user && adminEmails().includes(user.email.toLowerCase());

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الاشتراك والباقات</h1>
        <p className="text-sm text-muted-foreground">
          باقتك الحالية وحدودها، والباقات المتاحة للترقية
        </p>
      </div>
      <BillingClient
        currentPlan={currentPlan}
        plans={plans}
        usage={usage}
        isAdmin={isAdmin}
        supportWhatsapp={process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? ""}
      />
    </div>
  );
}
