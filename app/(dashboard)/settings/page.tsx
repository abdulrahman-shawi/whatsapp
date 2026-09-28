import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, ChevronLeft } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { getIntegrationList } from "@/lib/settings";
import { Card } from "@/components/ui/card";
import { IntegrationsForm } from "@/components/settings/integrations-form";

export const dynamic = "force-dynamic";

// صفحة الإعدادات: مفاتيح التكامل لمساحة العمل مع .env كبديل
export default async function SettingsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  // القيم المقنّعة فقط — لا تصل الأسرار الخام إلى المتصفح أبداً
  const integrations = await getIntegrationList(ctx.workspaceId);

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
    </div>
  );
}
