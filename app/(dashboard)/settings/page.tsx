import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  KeyRound,
  LayoutTemplate,
  Plug,
  ScrollText,
  ShieldCheck,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { getIntegrationList } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { IntegrationsForm } from "@/components/settings/integrations-form";
import { TemplatesForm } from "@/components/settings/templates-form";
import { MembersForm } from "@/components/settings/members-form";
import { StaffPermissionsCard } from "@/components/settings/staff-permissions-card";
import { SettingsNav } from "@/components/settings/settings-nav";

export const dynamic = "force-dynamic";

// بطاقة في نظرة عامة: إما تقفز لقسم في الصفحة أو لرابط خارجي
type OverviewCardDef = {
  title: string;
  description: string;
  icon: LucideIcon;
  tint: string;
} & ({ sectionId: string } | { href: string });

const ORG_CARDS: OverviewCardDef[] = [
  {
    sectionId: "members",
    title: "الأعضاء",
    description: "دعوة وإدارة أعضاء مساحة عملك",
    icon: Users,
    tint: "bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400",
  },
  {
    sectionId: "permissions",
    title: "الصلاحيات",
    description: "تقييد صلاحيات الموظفين على الأقسام الحساسة",
    icon: ShieldCheck,
    tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
  },
  {
    href: "/audit",
    title: "السجل",
    description: "سجل التدقيق: تتبع الأحداث التي تم تنفيذها",
    icon: ScrollText,
    tint: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  },
];

const INTEGRATION_CARDS: OverviewCardDef[] = [
  {
    sectionId: "integrations",
    title: "مفاتيح التكامل",
    description: "OpenAI وMeta وPusher وNeon لميزات المنصة",
    icon: Plug,
    tint: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
  },
  {
    href: "/settings/guide",
    title: "الدليل المصور",
    description: "شرح خطوة بخطوة لاستخراج كل مفتاح",
    icon: BookOpen,
    tint: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
  },
];

const TEMPLATE_CARDS: OverviewCardDef[] = [
  {
    sectionId: "templates",
    title: "قوالب الرسائل",
    description: "إنشاء وإدارة قوالب واتساب المعتمدة لإعادة الاستخدام",
    icon: LayoutTemplate,
    tint: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
  },
];

const DEVELOPER_CARDS: OverviewCardDef[] = [
  {
    href: "/webhooks",
    title: "Webhooks",
    description: "استقبال إشعارات فورية عند حدوث الأحداث بدلاً من التحقق منها يدوياً",
    icon: Webhook,
    tint: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400",
  },
  {
    href: "/api-keys",
    title: "مفاتيح API",
    description: "إنشاء مفاتيح للوصول إلى Flovo API والوصول إليها بشكل آمن",
    icon: KeyRound,
    tint: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
  },
];

// قسم من البطاقات في النظرة العامة
function OverviewGroup({
  title,
  cards,
}: {
  title: string;
  cards: OverviewCardDef[];
}) {
  return (
    <section>
      <h2 className="mb-4 text-center text-lg font-bold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const inner = (
            <>
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.tint}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{card.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {card.description}
                </span>
              </span>
            </>
          );
          const cls =
            "flex items-start gap-3 p-4 transition-shadow hover:shadow-md";
          return "href" in card ? (
            <Link key={card.title} href={card.href}>
              <Card className={cls}>{inner}</Card>
            </Link>
          ) : (
            <a key={card.title} href={`#${card.sectionId}`}>
              <Card className={cls}>{inner}</Card>
            </a>
          );
        })}
      </div>
    </section>
  );
}

// صفحة الإعدادات: نظرة عامة ببطاقات مصنّفة + شريط تنقل داخلي بأسلوب Flovoo
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
    { label: "الرئيسية", items: [{ id: "overview", label: "الرئيسية" }] },
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
  const sectionIds = ["members", "permissions", "integrations", "templates"];

  return (
    <div className="flex items-start gap-6">
      {/* شريط التنقل الداخلي — يمين المحتوى في RTL */}
      <aside className="hidden w-52 shrink-0 lg:block">
        <SettingsNav groups={navGroups} sectionIds={sectionIds} />
      </aside>

      <div className="min-w-0 flex-1 space-y-10">
        <div>
          <h1 className="text-2xl font-bold">الإعدادات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة مساحة عملك: الأعضاء، التكاملات، قوالب واتساب، وأدوات المطورين
          </p>
        </div>

        {/* النظرة العامة: بطاقات تقفز إلى الأقسام أو إلى الصفحات */}
        <div id="overview" className="scroll-mt-6 space-y-10">
          <OverviewGroup title="المؤسسة" cards={ORG_CARDS} />
          <OverviewGroup title="التكاملات" cards={INTEGRATION_CARDS} />
          <OverviewGroup title="مدير واتساب" cards={TEMPLATE_CARDS} />
          <OverviewGroup title="المطورون" cards={DEVELOPER_CARDS} />
        </div>

        <hr className="border-muted" />

        {/* الأقسام التفصيلية */}
        <section id="members" className="scroll-mt-6">
          <h2 className="text-lg font-semibold">الأعضاء</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            دعوات لمرة واحدة عبر الرابط — ينشئ المدعو حسابه وينضم مباشرة لمساحة
            العمل
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
        </section>

        <section id="permissions" className="scroll-mt-6">
          <StaffPermissionsCard
            initialRestricted={workspace?.restrictStaff ?? false}
          />
        </section>

        <section id="integrations" className="scroll-mt-6">
          <h2 className="text-lg font-semibold">مفاتيح التكامل</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            مفاتيح التكامل الخاصة بمساحة عملك — عند ترك مفتاح فارغاً تُستخدم قيمة
            .env الافتراضية
          </p>
          <IntegrationsForm integrations={integrations} />
        </section>

        <section id="templates" className="scroll-mt-6">
          <h2 className="text-lg font-semibold">قوالب رسائل واتساب</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            القوالب المعتمدة في لوحة Meta Business — تُرسل من صندوق الوارد (زر
            &quot;قالب&quot;) للمراسلة خارج نافذة ٢٤ ساعة
          </p>
          <TemplatesForm initialTemplates={templates} />
        </section>
      </div>
    </div>
  );
}
