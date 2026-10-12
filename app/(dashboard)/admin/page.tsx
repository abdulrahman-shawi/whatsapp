import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { CreditCard, Users, Wallet } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminConfigForm } from "@/components/admin/admin-config-form";

export const dynamic = "force-dynamic";

// بريدات مالك المنصة من .env — مفصولة بفواصل
function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// لوحة مالك المنصة: من اشترك، الإيرادات، وإعدادات Stripe ورقم الدعم
export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !adminEmails().includes(session.user.email.toLowerCase())) {
    redirect("/inbox");
  }

  const [workspaces, paidInvoices, plans] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        plan: true,
        members: {
          where: { role: "OWNER" },
          include: { user: { select: { email: true, name: true } } },
          take: 1,
        },
        settings: { where: { key: "STRIPE_SUBSCRIPTION_ID" }, take: 1 },
        invoices: {
          where: { status: "PAID" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { plan: { select: { name: true, priceMonthly: true } } },
        },
        _count: { select: { contacts: true, members: true } },
      },
    }),
    prisma.invoice.findMany({ where: { status: "PAID" } }),
    prisma.plan.findMany(),
  ]);

  const stripeActive = workspaces.filter((w) => w.settings.length > 0);
  const mrr = stripeActive.reduce(
    (sum, w) => sum + (w.plan?.priceMonthly ?? 0),
    0
  );
  const totalRevenue = paidInvoices.reduce((sum, i) => sum + i.amount, 0);

  const stats = [
    { label: "مساحات العمل", value: workspaces.length, icon: Users },
    { label: "اشتراكات Stripe نشطة", value: stripeActive.length, icon: CreditCard },
    { label: "الإيراد الشهري (MRR)", value: `$${(mrr / 100).toFixed(0)}`, icon: Wallet },
    {
      label: "إجمالي الإيرادات",
      value: `$${(totalRevenue / 100).toFixed(2)}`,
      icon: Wallet,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة المنصة</h1>
        <p className="text-sm text-muted-foreground">
          المشتركون والإيرادات وإعدادات Stripe — لمالك المنصة فقط
        </p>
      </div>

      {/* الإحصاءات */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="rounded-lg bg-accent p-2 text-accent-foreground">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* إعدادات المنصة */}
      <AdminConfigForm />

      {/* المشتركون */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">المساحات والاشتراكات</CardTitle>
          <CardDescription>
            آخر {workspaces.length} مساحة عمل — الاشتراك النشط يعني وجود اشتراك
            Stripe ساري، واليدوي يعني تفعيلاً من مالك المنصة
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-muted-foreground">
                <th className="pb-2 text-start font-medium">المساحة</th>
                <th className="pb-2 text-start font-medium">المالك</th>
                <th className="pb-2 text-start font-medium">الباقة</th>
                <th className="pb-2 text-start font-medium">حالة الاشتراك</th>
                <th className="pb-2 text-start font-medium">أعضاء</th>
                <th className="pb-2 text-start font-medium">عملاء</th>
                <th className="pb-2 text-start font-medium">آخر دفعة</th>
                <th className="pb-2 text-start font-medium">الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w) => {
                const active = w.settings.length > 0;
                return (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{w.name}</td>
                    <td className="py-2 text-muted-foreground" dir="ltr">
                      {w.members[0]?.user.email ?? "—"}
                    </td>
                    <td className="py-2">{w.plan?.name ?? "الافتراضية"}</td>
                    <td className="py-2">
                      {active ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          نشط (Stripe)
                        </span>
                      ) : w.plan ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                          يدوي
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          بدون باقة
                        </span>
                      )}
                    </td>
                    <td className="py-2">{w._count.members}</td>
                    <td className="py-2">{w._count.contacts}</td>
                    <td className="py-2 text-muted-foreground">
                      {w.invoices[0]
                        ? `${(w.invoices[0].amount / 100).toFixed(2)} ${
                            w.invoices[0].plan?.name ?? ""
                          }`
                        : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(w.createdAt).toLocaleDateString("ar")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
