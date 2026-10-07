import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CONTACT_STAGES, stageConfig } from "@/lib/contact-stages";
import { SENTIMENT_LABELS, type Sentiment } from "@/lib/sentiment";

export const dynamic = "force-dynamic";

// تقارير تشغيلية سريعة: نشاط الرسائل، توزيع المراحل والمزاج، وتدريب الوكيل
export default async function ReportsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [conversations, contacts, recentMessages, monthMessages, bookings, ratings] =
    await Promise.all([
      prisma.conversation.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { sentiment: true, contact: { select: { stage: true } } },
      }),
      prisma.contact.count({ where: { workspaceId: ctx.workspaceId } }),
      prisma.message.findMany({
        where: { conversation: { workspaceId: ctx.workspaceId }, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.message.count({
        where: { conversation: { workspaceId: ctx.workspaceId }, createdAt: { gte: monthStart } },
      }),
      prisma.booking.count({ where: { workspaceId: ctx.workspaceId } }),
      prisma.message.groupBy({
        by: ["rating"],
        where: { conversation: { workspaceId: ctx.workspaceId }, rating: { not: null } },
        _count: true,
      }),
    ]);

  // رسائل لكل يوم (آخر ١٤ يوماً) — تجميع في الذاكرة
  const perDay: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toDateString();
    perDay.push({
      day: new Intl.DateTimeFormat("ar", { weekday: "short", day: "numeric" }).format(d),
      count: recentMessages.filter((m) => m.createdAt.toDateString() === key).length,
    });
  }
  const maxDay = Math.max(...perDay.map((d) => d.count), 1);

  // توزيع المراحل والمزاج
  const stageCounts = new Map<string, number>();
  const sentimentCounts = new Map<string, number>();
  for (const c of conversations) {
    stageCounts.set(c.contact.stage, (stageCounts.get(c.contact.stage) ?? 0) + 1);
    sentimentCounts.set(c.sentiment ?? "NEUTRAL", (sentimentCounts.get(c.sentiment ?? "NEUTRAL") ?? 0) + 1);
  }
  const maxStage = Math.max(...[...stageCounts.values()], 1);
  const goodCount = ratings.find((r) => r.rating === "GOOD")?._count ?? 0;
  const badCount = ratings.find((r) => r.rating === "NEEDS_IMPROVEMENT")?._count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">التقارير</h1>

      {/* أرقام إجمالية */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "محادثة", value: conversations.length },
          { label: "جهة اتصال", value: contacts },
          { label: "رسالة هذا الشهر", value: monthMessages },
          { label: "حجز", value: bookings },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-primary">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* نشاط الرسائل اليومي */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الرسائل — آخر ١٤ يوماً</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1">
              {perDay.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{d.count}</span>
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${Math.max((d.count / maxDay) * 100, d.count > 0 ? 4 : 1)}%` }}
                    title={`${d.day}: ${d.count} رسالة`}
                  />
                  <span className="text-[9px] text-muted-foreground">{d.day}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* توزيع المراحل */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">المحادثات حسب مرحلة العميل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {CONTACT_STAGES.map((stage) => {
              const count = stageCounts.get(stage.value) ?? 0;
              return (
                <div key={stage.value} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: stageConfig(stage.value).color }}
                  />
                  <span className="w-24 shrink-0">{stage.label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${(count / maxStage) * 100}%`,
                        backgroundColor: stageConfig(stage.value).color,
                      }}
                    />
                  </div>
                  <span className="w-8 text-end text-xs text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* مزاج العملاء */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">نية الشراء والمزاج</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(Object.keys(SENTIMENT_LABELS) as Sentiment[]).map((key) => (
              <Badge key={key} variant="secondary" className="gap-1 px-3 py-1.5 text-sm">
                {SENTIMENT_LABELS[key]}
                <span className="font-bold">{sentimentCounts.get(key) ?? 0}</span>
              </Badge>
            ))}
          </CardContent>
        </Card>

        {/* تدريب الوكيل */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">تدريب الوكيل من التقييمات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>ردود جيدة (تُحقن في البرومبت)</span>
              <Badge className="bg-emerald-600">{goodCount}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>ردود تحتاج تحسيناً</span>
              <Badge variant="secondary">{badCount}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              قيّم ردود الذكاء من الوارد بأزرار الإبهام — الجيد منها يصبح مثالاً يحتذيه الوكيل.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
