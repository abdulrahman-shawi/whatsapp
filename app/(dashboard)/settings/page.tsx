import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { getIntegrationList } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { IntegrationsForm } from "@/components/settings/integrations-form";
import { TemplatesForm } from "@/components/settings/templates-form";
import { MembersForm } from "@/components/settings/members-form";
import { StaffPermissionsCard } from "@/components/settings/staff-permissions-card";
import { SettingsShell } from "@/components/settings/settings-shell";
import { UsageSection } from "@/components/settings/usage-section";
import { BillingSection } from "@/components/settings/billing-section";
import { WebhooksClient } from "@/components/webhooks/webhooks-client";
import { ApiKeysClient } from "@/components/api-keys/api-keys-client";

export const dynamic = "force-dynamic";

// صفحة الإعدادات: كل إدارة مساحة العمل في مكان واحد — للمالك فقط
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { success?: string; canceled?: string };
}) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  // القيم المقنّعة فقط — لا تصل الأسرار الخام إلى المتصفح أبداً
  const [
    integrations,
    templates,
    memberships,
    invites,
    workspace,
    webhooks,
    workflows,
    outboundWebhooks,
    apiKeys,
  ] = await Promise.all([
    getIntegrationList(ctx.workspaceId),
    prisma.template.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.workspaceInvite.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { restrictStaff: true },
    }),
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
    prisma.outboundWebhook.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.apiKey.findMany({
      where: { workspaceId: ctx.workspaceId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const navGroups = [
    {
      label: "المؤسسة",
      items: [
        { id: "members", label: "الأعضاء" },
        { id: "permissions", label: "الصلاحيات" },
        { id: "audit", label: "السجل", href: "/audit" },
      ],
    },
    {
      label: "التكاملات",
      items: [
        { id: "integrations", label: "مفاتيح التكامل" },
        { id: "guide", label: "الدليل المصور", href: "/settings/guide" },
      ],
    },
    {
      label: "مدير واتساب",
      items: [{ id: "templates", label: "القوالب" }],
    },
    {
      label: "المطورون",
      items: [
        { id: "webhooks", label: "الويب هوكات" },
        { id: "api-keys", label: "مفاتيح API" },
      ],
    },
    {
      label: "الاشتراك والاستهلاك",
      items: [
        { id: "billing", label: "الاشتراك والباقات" },
        { id: "usage", label: "الاستهلاك" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">
          إدارة مساحة عملك من مكان واحد: الأعضاء، التكاملات، القوالب،
          المطورون، والاشتراك
        </p>
      </div>

      <SettingsShell
        groups={navGroups}
        defaultId="members"
        sections={[
          {
            id: "members",
            group: "المؤسسة",
            node: (
              <div>
                <h3 className="text-base font-semibold">الأعضاء</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  دعوات لمرة واحدة عبر الرابط — ينشئ المدعو حسابه وينضم مباشرة
                  لمساحة العمل
                </p>
                <MembersForm
                  initialMembers={memberships.map((m) => ({
                    userId: m.user.id,
                    name: m.user.name,
                    email: m.user.email,
                    role: m.role,
                  }))}
                  initialInvites={invites.map((i) => ({
                    id: i.id,
                    token: i.token,
                    role: i.role,
                  }))}
                  currentUserId={ctx.userId}
                  myRole={ctx.role}
                />
              </div>
            ),
          },
          {
            id: "permissions",
            group: "المؤسسة",
            node: (
              <StaffPermissionsCard
                initialRestricted={workspace?.restrictStaff ?? false}
              />
            ),
          },
          {
            id: "integrations",
            group: "التكاملات",
            node: (
              <div>
                <h3 className="text-base font-semibold">مفاتيح التكامل</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  مفاتيح التكامل الخاصة بمساحة عملك — عند ترك مفتاح فارغاً
                  تُستخدم قيمة .env الافتراضية
                </p>
                <IntegrationsForm integrations={integrations} />
              </div>
            ),
          },
          {
            id: "templates",
            group: "مدير واتساب",
            node: (
              <div>
                <h3 className="text-base font-semibold">قوالب رسائل واتساب</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  القوالب المعتمدة في لوحة Meta Business — تُرسل من صندوق الوارد
                  (زر &quot;قالب&quot;) للمراسلة خارج نافذة ٢٤ ساعة
                </p>
                <TemplatesForm initialTemplates={templates} />
              </div>
            ),
          },
          {
            id: "webhooks",
            group: "المطورون",
            node: (
              <div>
                <h3 className="text-base font-semibold">الويب هوكات</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  الويب هوك الوارد: روابط عامة تستقبل أحداثاً من أنظمة خارجية
                  (متجر، نموذج طلبات) وتفتح محادثة واتساب مع تشغيل الأتمتة —
                  والويب هوك الصادر: أرسل أحداث المنصة (رسائل، عملاء، محادثات…)
                  إلى أنظمتك
                </p>
                <WebhooksClient
                  initialWebhooks={webhooks.map((w) => ({
                    ...w,
                    createdAt: w.createdAt.toISOString(),
                    lastHitAt: w.lastHitAt ? w.lastHitAt.toISOString() : null,
                  }))}
                  workflows={workflows}
                  initialOutbound={outboundWebhooks.map((w) => ({
                    id: w.id,
                    name: w.name,
                    url: w.url,
                    events: w.events,
                    isActive: w.isActive,
                    lastFiredAt: w.lastFiredAt
                      ? w.lastFiredAt.toISOString()
                      : null,
                    lastStatus: w.lastStatus,
                    createdAt: w.createdAt.toISOString(),
                  }))}
                />
              </div>
            ),
          },
          {
            id: "api-keys",
            group: "المطورون",
            node: (
              <ApiKeysClient
                initialKeys={apiKeys.map((k) => ({
                  ...k,
                  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
                  revokedAt: k.revokedAt?.toISOString() ?? null,
                  createdAt: k.createdAt.toISOString(),
                }))}
              />
            ),
          },
          {
            id: "billing",
            group: "الاشتراك والاستهلاك",
            node: (
              <BillingSection
                workspaceId={ctx.workspaceId}
                userId={ctx.userId}
                success={searchParams.success === "1"}
                canceled={searchParams.canceled === "1"}
              />
            ),
          },
          {
            id: "usage",
            group: "الاشتراك والاستهلاك",
            node: <UsageSection workspaceId={ctx.workspaceId} />,
          },
        ]}
      />
    </div>
  );
}
