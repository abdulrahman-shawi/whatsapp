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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [conversations, contacts, recentMessages, monthMessages, bookings, ratings, timingMessages, inboundBodies, staffMessages, staffAssignments, members] =
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
      // آخر ٥٠٠ رسالة مرتبة زمنياً لحساب متوسط زمن الرد
      prisma.message.findMany({
        where: { conversation: { workspaceId: ctx.workspaceId }, isNote: false },
        orderBy: { createdAt: "asc" },
        take: 500,
        select: { direction: true, createdAt: true },
      }),
      // آخر ٢٠٠ رسالة واردة لتحليل أكثر الكلمات تكراراً
      prisma.message.findMany({
        where: { conversation: { workspaceId: ctx.workspaceId }, direction: "INBOUND", isNote: false },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { body: true },
      }),
      // رسائل الموظفين الصادرة آخر ٣٠ يوماً
      prisma.message.groupBy({
        by: ["senderId"],
        where: {
          conversation: { workspaceId: ctx.workspaceId },
          senderType: "HUMAN",
          direction: "OUTBOUND",
          isNote: false,
          senderId: { not: null },
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: true,
      }),
      // المحادثات المسندة لكل موظف
      prisma.conversationAssignee.groupBy({
        by: ["userId"],
        where: { conversation: { workspaceId: ctx.workspaceId } },
        _count: true,
      }),
      // أعضاء مساحة العمل لعرض الأسماء
      prisma.workspaceMember.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { user: { select: { id: true, name: true } } },
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

  // متوسط زمن الرد الأول: الفرق بين آخر رسالة واردة وأول رسالة صادرة تليها (تجاهل الفجوات الطويلة)
  let lastInboundAt: Date | null = null;
  const responseDiffs: number[] = [];
  for (const m of timingMessages) {
    if (m.direction === "INBOUND") {
      lastInboundAt = m.createdAt;
    } else if (lastInboundAt) {
      const diffSec = (m.createdAt.getTime() - lastInboundAt.getTime()) / 1000;
      if (diffSec >= 0 && diffSec <= 30 * 60) responseDiffs.push(diffSec);
      lastInboundAt = null;
    }
  }
  const avgResponseSec =
    responseDiffs.length > 0
      ? Math.round(responseDiffs.reduce((a, b) => a + b, 0) / responseDiffs.length)
      : null;
  const avgResponseLabel =
    avgResponseSec === null
      ? "—"
      : avgResponseSec < 60
        ? `${avgResponseSec} ثانية`
        : `${Math.floor(avgResponseSec / 60)} د ${avgResponseSec % 60} ث`;

  // أكثر الكلمات تكراراً في رسائل العملاء (بعد تطبيع الحروف العربية وتجاهل كلمات شائعة)
  const STOP_WORDS = new Set([
    "الى", "الي", "علي", "عنه", "عنها", "عند", "هذا", "هذه", "ذلك", "التي",
    "الذي", "لقد", "كان", "يكون", "هل", "لم", "لن", "كل", "بعد", "قبل",
    "ثم", "انا", "نعم", "شكرا", "مع", "بل", "كما", "نحن", "انت", "لكن",
    "ماذا", "كيف", "ايه", "يا", "لو", "قد", "تم", "فيه", "منها", "منه",
    "ليس", "غير", "بعض", "حتي", "داخل", "عبر", "او", "انا",
  ]);
  const wordCounts = new Map<string, number>();
  for (const { body } of inboundBodies) {
    const normalized = body
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, " ");
    for (const raw of normalized.split(/\s+/)) {
      const w = raw.trim();
      if (w.length < 3 || STOP_WORDS.has(w)) continue;
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
  }
  const topWords = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const maxWord = topWords[0]?.[1] ?? 1;

  // أداء الموظفين: رسائل صادرة + محادثات مسندة
  const staffRows = members.map((m) => {
    const sent = staffMessages.find((s) => s.senderId === m.user.id)?._count ?? 0;
    const assigned = staffAssignments.find((a) => a.userId === m.user.id)?._count ?? 0;
    return { id: m.user.id, name: m.user.name || "بدون اسم", sent, assigned };
  });
  const maxStaffSent = Math.max(...staffRows.map((s) => s.sent), 1);

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
                  <span className="w-14 text-end text-xs text-muted-foreground">
                    {count} · {conversations.length > 0 ? Math.round((count / conversations.length) * 100) : 0}٪
                  </span>
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

        {/* متوسط زمن الرد */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">متوسط زمن الرد الأول</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-2xl font-bold text-primary">{avgResponseLabel}</p>
            <p className="text-xs text-muted-foreground">
              من {responseDiffs.length} رداً مُقاساً خلال آخر ٥٠٠ رسالة (تُستبعد الفجوات فوق ٣٠ دقيقة).
            </p>
          </CardContent>
        </Card>

        {/* أكثر الكلمات تكراراً */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">أكثر كلمات العملاء تكراراً — آخر ٢٠٠ رسالة واردة</CardTitle>
          </CardHeader>
          <CardContent>
            {topWords.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد رسائل كافية للتحليل بعد.</p>
            ) : (
              <div className="space-y-2">
                {topWords.map(([word, count]) => (
                  <div key={word} className="flex items-center gap-2 text-sm">
                    <span className="w-28 shrink-0 truncate">{word}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full rounded bg-primary/70"
                        style={{ width: `${(count / maxWord) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-end text-xs text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* أداء الموظفين */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">أداء الموظفين — آخر ٣٠ يوماً</CardTitle>
          </CardHeader>
          <CardContent>
            {staffRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد موظفون في مساحة العمل.</p>
            ) : (
              <div className="space-y-3">
                {staffRows
                  .slice()
                  .sort((a, b) => b.sent - a.sent)
                  .map((s) => (
                    <div key={s.id} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 truncate font-medium">{s.name}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded bg-emerald-500/70"
                          style={{ width: `${(s.sent / maxStaffSent) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-end text-xs text-muted-foreground">
                        {s.sent} رسالة
                      </span>
                      <span className="w-24 shrink-0 text-end text-xs text-muted-foreground">
                        {s.assigned} محادثة مسندة
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
