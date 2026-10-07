import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ReceiptText } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { relativeTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// صفحة الفواتير: سجل مدفوعات مساحة العمل القادمة من Stripe
export default async function InvoicesPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  const [invoices, plans] = await Promise.all([
    prisma.invoice.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.plan.findMany(),
  ]);
  const planName = new Map(plans.map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">الفواتير</h1>
          <p className="text-sm text-muted-foreground">
            سجل مدفوعات اشتراكات مساحة العمل
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/billing">
            <ArrowRight className="h-4 w-4" />
            العودة إلى الاشتراك
          </Link>
        </Button>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ReceiptText className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">لا توجد فواتير بعد</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">آخر {invoices.length} فاتورة</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-start font-medium">الباقة</th>
                  <th className="pb-2 text-start font-medium">المبلغ</th>
                  <th className="pb-2 text-start font-medium">الحالة</th>
                  <th className="pb-2 text-start font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="py-2">
                      {(inv.planId && planName.get(inv.planId)) || "—"}
                    </td>
                    <td className="py-2" dir="ltr">
                      ${(inv.amount / 100).toFixed(2)} {inv.currency.toUpperCase()}
                    </td>
                    <td className="py-2">
                      {inv.status === "PAID" && (
                        <Badge className="bg-green-100 text-green-700">
                          مدفوعة
                        </Badge>
                      )}
                      {inv.status === "FAILED" && (
                        <Badge className="bg-red-100 text-red-700">فاشلة</Badge>
                      )}
                      {inv.status === "PENDING" && (
                        <Badge variant="secondary">قيد الانتظار</Badge>
                      )}
                      {!["PAID", "FAILED", "PENDING"].includes(inv.status) && (
                        <Badge variant="secondary">{inv.status}</Badge>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {relativeTime(inv.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
