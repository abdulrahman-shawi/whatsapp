import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, ChevronLeft } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { getIntegrationList } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { IntegrationsForm } from "@/components/settings/integrations-form";
import { TemplatesForm } from "@/components/settings/templates-form";
import { MembersForm } from "@/components/settings/members-form";

export const dynamic = "force-dynamic";

// صفحة الإعدادات: مفاتيح التكامل لمساحة العمل مع .env كبديل
export default async function SettingsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  // القيم المقنّعة فقط — لا تصل الأسرار الخام إلى المتصفح أبداً
  const [integrations, templates, memberships, invites] = await Promise.all([
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
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">
          مفاتيح التكامل الخاصة بمساحة عملك — عند ترك مفتاح فارغاً تُستخدم قيمة
          .env الافتراضية
        </p>
      </div>

      {/* رابط بارز للدليل المصوّر */}
      <Link href="/settings/guide">
        <Card className="flex items-center justify-between gap-3 border-primary/30 bg-accent/50 p-4 transition-colors hover:bg-accent">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-accent-foreground">
                دليل استخراج المفاتيح خطوة بخطوة
              </p>
              <p className="text-sm text-muted-foreground">
                شرح مصوّر بالعربية لاستخراج كل مفتاح من OpenAI وMeta وPusher
                وNeon
              </p>
            </div>
          </div>
          <ChevronLeft className="h-5 w-5 shrink-0 text-primary" />
        </Card>
      </Link>

      <IntegrationsForm integrations={integrations} />

      {/* فريق العمل: دعوات وأعضاء وأدوار */}
      <div>
        <h2 className="text-lg font-semibold">فريق العمل</h2>
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
      </div>

      {/* قوالب رسائل واتساب المعتمدة */}
      <div>
        <h2 className="text-lg font-semibold">قوالب رسائل واتساب</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          القوالب المعتمدة في لوحة Meta Business — تُرسل من صندوق الوارد (زر
          "قالب") للمراسلة خارج نافذة ٢٤ ساعة
        </p>
        <TemplatesForm initialTemplates={templates} />
      </div>
    </div>
  );
}
