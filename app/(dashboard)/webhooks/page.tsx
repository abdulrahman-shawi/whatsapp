import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WebhooksClient } from "@/components/webhooks/webhooks-client";

export const dynamic = "force-dynamic";

// الويب هوك الوارد: روابط عامة تستقبل أحداثاً من أنظمة خارجية وتفتح محادثات واتساب
export default async function WebhooksPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  const [webhooks, workflows] = await Promise.all([
    prisma.inboundWebhook.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.workflow.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الويب هوك الوارد</h1>
        <p className="text-sm text-muted-foreground">
          روابط عامة تستقبل أحداثاً من أنظمة خارجية (متجر، نموذج طلبات) وتفتح
          محادثة واتساب مع تشغيل الأتمتة
        </p>
      </div>
      <WebhooksClient
        initialWebhooks={webhooks.map((w) => ({
          ...w,
          createdAt: w.createdAt.toISOString(),
          lastHitAt: w.lastHitAt ? w.lastHitAt.toISOString() : null,
        }))}
        workflows={workflows}
      />
    </div>
  );
}
