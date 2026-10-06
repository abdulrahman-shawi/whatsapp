import { redirect } from "next/navigation";
import { AlertTriangle, Bot, Hand, MessagesSquare, UserCheck } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getUsageStatus } from "@/lib/billing/plans";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

// صفحة الاستهلاك: رصيد الرسائل الشهري وإحصاءات المحادثات
export default async function UsagePage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const [usageStatus, history, grouped] = await Promise.all([
    // الحد من الباقة الفعلية للمساحة
    getUsageStatus(ctx.workspaceId),
    // سجلات آخر ٦ أشهر إن وجدت
    prisma.usageRecord.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { month: "desc" },
      take: 6,
    }),
    // عدد المحادثات حسب الحالة
    prisma.conversation.groupBy({
      by: ["status"],
      where: { workspaceId: ctx.workspaceId },
      _count: true,
    }),
  ]);

  const used = usageStatus.used;
  const limit = usageStatus.limit;
  const remaining = usageStatus.remaining;
  const percent = usageStatus.percent;

  const countOf = (status: string) =>
    grouped.find((g) => g.status === status)?._count ?? 0;
  const total = grouped.reduce((sum, g) => sum + g._count, 0);

  // لون شريط التقدم حسب النسبة — هادئ وغير صارخ
  const barColor =
    percent >= 95 ? "bg-red-400" : percent >= 80 ? "bg-amber-400" : "bg-primary";

  const stats = [
    { label: "إجمالي المحادثات", value: total, icon: MessagesSquare },
    { label: "المغلقة آلياً", value: countOf("AI"), icon: Bot },
    { label: "اليدوية", value: countOf("MANUAL"), icon: UserCheck },
    { label: "المسلّمة للبشري", value: countOf("HANDED_OFF"), icon: Hand },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الاستهلاك</h1>
        <p className="text-sm text-muted-foreground">
          رصيد رسائلك الشهري وإحصاءات المحادثات
        </p>
      </div>

      {/* تنبيه الاقتراب من الحد */}
      {percent >= 80 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          اقترب رصيدك من الانتهاء — استهلكت {percent}٪ من رسائلك هذا الشهر.
          تواصل معنا لترقية باقتك.
        </div>
      )}
      {usageStatus.tokens.percent >= 80 && (
        <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          اقترب استهلاك الذكاء الاصطناعي من حده — {usageStatus.tokens.percent}٪ من التوكنات الشهرية.
        </div>
      )}

      {/* بطاقات الرصيد */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>الرسائل المستهلكة هذا الشهر</CardDescription>
            <CardTitle className="text-3xl">
              {used} <span className="text-base font-normal text-muted-foreground">/ {limit}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>توكنات الذكاء الاصطناعي (OpenAI)</CardDescription>
            <CardTitle className="text-3xl">
              {usageStatus.tokens.used.toLocaleString("en")}{" "}
              <span className="text-base font-normal text-muted-foreground">
                / {usageStatus.tokens.limit.toLocaleString("en")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all bg-violet-400"
                style={{ width: `${usageStatus.tokens.percent}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>الرسائل المتبقية</CardDescription>
            <CardTitle className="text-3xl">{remaining}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>نسبة الاستهلاك</CardDescription>
            <CardTitle className="text-3xl">{percent}٪</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* إحصاءات المحادثات */}
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

      {/* سجل الأشهر السابقة */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">سجل الاستهلاك الشهري</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-start font-medium">الشهر</th>
                  <th className="pb-2 text-start font-medium">الرسائل</th>
                  <th className="pb-2 text-start font-medium">حد الرسائل</th>
                  <th className="pb-2 text-start font-medium">توكنات AI</th>
                  <th className="pb-2 text-start font-medium">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2" dir="ltr">{r.month}</td>
                    <td className="py-2">{r.messagesUsed}</td>
                    <td className="py-2">{r.messageLimit}</td>
                    <td className="py-2">{r.tokensUsed.toLocaleString("en")}</td>
                    <td className="py-2">
                      {Math.round((r.messagesUsed / r.messageLimit) * 100)}٪
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
