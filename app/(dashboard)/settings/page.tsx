import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { getIntegrationList } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { IntegrationsForm } from "@/components/settings/integrations-form";
import { TemplatesForm } from "@/components/settings/templates-form";
import { MembersForm } from "@/components/settings/members-form";
import { StaffPermissionsCard } from "@/components/settings/staff-permissions-card";
import { SettingsShell } from "@/components/settings/settings-shell";

export const dynamic = "force-dynamic";

// صفحة الإعدادات: شريط تنقل داخلي بأسلوب Flovoo — قسم واحد ظاهر في كل مرة
export default async function SettingsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  // القيم المقنّعة فقط — لا تصل الأسرار الخام إلى المتصفح أبداً
  const [integrations, templates, memberships, invites, workspace] =
    await Promise.all([
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
        { id: "webhooks", label: "Webhooks", href: "/webhooks" },
        { id: "api-keys", label: "مفاتيح API", href: "/api-keys" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">
          إدارة مساحة عملك: الأعضاء، التكاملات، قوالب واتساب، وأدوات المطورين
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
        ]}
      />
    </div>
  );
}
