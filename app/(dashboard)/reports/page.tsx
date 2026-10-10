import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CONTACT_STAGES, stageConfig } from "@/lib/contact-stages";
import { SENTIMENT_LABELS, type Sentiment } from "@/lib/sentiment";
import type { ContactStage } from "@prisma/client";

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

  const [conversations, contacts, recentMessages, monthMessages, bookings, ratings, timingMessages, inboundBodies, staffMessages, staffAssignments, members, csatAgg, senderTypeAgg, stageHistory, usageRecords] =
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
      // متوسط تقييم الرضا (CSAT) للمحادثات المقيّمة
      prisma.conversation.aggregate({
        where: { workspaceId: ctx.workspaceId, csatRating: { not: null } },
        _avg: { csatRating: true },
        _count: true,
      }),
      // الرسائل الصادرة حسب مرسلها (ذكاء اصطناعي مقابل بشري) آخر ٣٠ يوماً
      prisma.message.groupBy({
        by: ["senderType"],
        where: {
          conversation: { workspaceId: ctx.workspaceId },
          senderType: { in: ["AI", "HUMAN"] },
          direction: "OUTBOUND",
          isNote: false,
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: true,
      }),
      // سجل تغيّر مراحل العملاء لحساب قمع التحويل
      prisma.contactStageHistory.findMany({
        where: { contact: { workspaceId: ctx.workspaceId } },
        select: { contactId: true, stage: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      // استهلاك الباقة آخر ٦ أشهر
      prisma.usageRecord.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { month: "desc" },
        take: 6,
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
  const responseDiffsByDay = new Map<string, number[]>();
  for (const m of timingMessages) {
    if (m.direction === "INBOUND") {
      lastInboundAt = m.createdAt;
    } else if (lastInboundAt) {
      const diffSec = (m.createdAt.getTime() - lastInboundAt.getTime()) / 1000;
      if (diffSec >= 0 && diffSec <= 30 * 60) {
        responseDiffs.push(diffSec);
        const dayKey = lastInboundAt.toDateString();
        const list = responseDiffsByDay.get(dayKey) ?? [];
        list.push(diffSec);
        responseDiffsByDay.set(dayKey, list);
      }
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

  // زمن الرد اليومي (آخر ١٤ يوماً) — متوسط الفرق بالدقائق لكل يوم
  const responsePerDay: { day: string; avgMin: number | null }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const diffs = responseDiffsByDay.get(d.toDateString());
    responsePerDay.push({
      day: new Intl.DateTimeFormat("ar", { weekday: "short", day: "numeric" }).format(d),
      avgMin: diffs && diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length / 60 : null,
    });
  }
  const maxResponseMin = Math.max(...responsePerDay.map((d) => d.avgMin ?? 0), 1);

  // نسبة الرد: ذكاء اصطناعي مقابل بشري (رسائل صادرة آخر ٣٠ يوماً)
  const aiCount = senderTypeAgg.find((s) => s.senderType === "AI")?._count ?? 0;
  const humanCount = senderTypeAgg.find((s) => s.senderType === "HUMAN")?._count ?? 0;
  const totalOutbound = aiCount + humanCount;

  // قمع تحويل المبيعات من سجل المراحل: عدد الواصلين لكل مرحلة بعد سابقتها + متوسط المدة فيها
  const FUNNEL_STAGES: ContactStage[] = ["NEW", "CONTACTING", "INTERESTED", "NEGOTIATING", "CUSTOMER"];
  const historyByContact = new Map<string, { stage: ContactStage; createdAt: Date }[]>();
  for (const h of stageHistory) {
    const list = historyByContact.get(h.contactId) ?? [];
    list.push({ stage: h.stage, createdAt: h.createdAt });
    historyByContact.set(h.contactId, list);
  }
  const funnelRows = FUNNEL_STAGES.map((stage, i) => {
    let count = 0;
    let daysSum = 0;
    let daysN = 0;
    for (const entries of historyByContact.values()) {
      const idx = entries.findIndex((e) => e.stage === stage);
      if (idx === -1) continue;
      if (i > 0) {
        // يُحتسب الوصول للمرحلة فقط إذا سبقته المرحلة السابقة فعلاً في السجل
        const prevIdx = entries.findIndex((e) => e.stage === FUNNEL_STAGES[i - 1]);
        if (prevIdx === -1 || entries[prevIdx].createdAt >= entries[idx].createdAt) continue;
      }
      count++;
      if (idx < entries.length - 1) {
        daysSum += (entries[idx + 1].createdAt.getTime() - entries[idx].createdAt.getTime()) / (24 * 60 * 60 * 1000);
        daysN++;
      }
    }
    return { stage, count, avgDays: daysN > 0 ? daysSum / daysN : null };
  });
  const maxFunnel = Math.max(...funnelRows.map((r) => r.count), 1);

  // استهلاك الباقة آخر ٦ أشهر (تصاعدياً) + المتبقي من الشهر الحالي
  const usageMonths = usageRecords.slice().reverse();
  const maxMessages = Math.max(...usageMonths.map((u) => Math.max(u.messagesUsed, u.messageLimit)), 1);
  const maxTokens = Math.max(...usageMonths.map((u) => Math.max(u.tokensUsed, u.tokenLimit)), 1);
  const currentMonthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
  const currentUsage = usageRecords.find((u) => u.month === currentMonthKey);
  const monthName = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Intl.DateTimeFormat("ar", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  };

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

        {/* قمع تحويل المبيعات من سجل المراحل */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">قمع تحويل المبيعات</CardTitle>
          </CardHeader>
          <CardContent>
            {stageHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد بيانات كافية بعد — تُسجَّل المراحل مع أول تغيير لمرحلة عميل.</p>
            ) : (
              <div className="space-y-2">
                {funnelRows.map((row, i) => {
                  const prev = i > 0 ? funnelRows[i - 1] : null;
                  const conversion = prev && prev.count > 0 ? Math.round((row.count / prev.count) * 100) : null;
                  return (
                    <div key={row.stage} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: stageConfig(row.stage).color }}
                      />
                      <span className="w-28 shrink-0">{stageConfig(row.stage).label}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${(row.count / maxFunnel) * 100}%`,
                            backgroundColor: stageConfig(row.stage).color,
                          }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-end text-xs text-muted-foreground">
                        {row.count}
                      </span>
                      <span className="w-28 shrink-0 text-end text-xs text-muted-foreground">
                        {conversion === null
                          ? row.avgDays === null
                            ? "—"
                            : `متوسط ${row.avgDays.toFixed(1)} يوم`
                          : `${conversion}٪ تحويل · ${row.avgDays === null ? "—" : `${row.avgDays.toFixed(1)} يوم`}`}
                      </span>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  يُحتسب الوصول لكل مرحلة فقط للجهات التي مرّت بالمرحلة السابقة فعلاً — يستبعد «ضائع» من القمع.
                </p>
              </div>
            )}
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

        {/* تقييم الرضا (CSAT) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">تقييم الرضا (CSAT)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {csatAgg._count > 0 ? (
              <>
                <p className="text-2xl font-bold text-primary">
                  {(csatAgg._avg.csatRating ?? 0).toFixed(1)}/٥
                </p>
                <p className="text-xs text-muted-foreground">
                  من {csatAgg._count} محادثة مقيّمة
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                لا توجد تقييمات بعد — تُرسل تلقائياً بعد إغلاق المحادثة
              </p>
            )}
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

        {/* نسبة الرد: ذكاء اصطناعي مقابل بشري */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">نسبة الرد: ذكاء اصطناعي مقابل بشري — آخر ٣٠ يوماً</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {totalOutbound === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد رسائل صادرة كافية للتحليل بعد.</p>
            ) : (
              <>
                <div className="flex h-6 w-full overflow-hidden rounded">
                  <div
                    className="h-full bg-primary/80"
                    style={{ width: `${(aiCount / totalOutbound) * 100}%` }}
                    title={`ذكاء اصطناعي: ${aiCount}`}
                  />
                  <div
                    className="h-full bg-emerald-500/80"
                    style={{ width: `${(humanCount / totalOutbound) * 100}%` }}
                    title={`بشري: ${humanCount}`}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary/80" />
                    ذكاء اصطناعي: {aiCount} · {Math.round((aiCount / totalOutbound) * 100)}٪
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                    بشري: {humanCount} · {Math.round((humanCount / totalOutbound) * 100)}٪
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* زمن الرد اليومي */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">زمن الرد اليومي — آخر ١٤ يوماً</CardTitle>
          </CardHeader>
          <CardContent>
            {responseDiffs.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد ردود مُقاسة بعد.</p>
            ) : (
              <div className="flex h-40 items-end gap-1">
                {responsePerDay.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {d.avgMin === null ? "—" : `${Math.round(d.avgMin)}د`}
                    </span>
                    <div
                      className="w-full rounded-t bg-amber-500/80"
                      style={{
                        height: `${d.avgMin === null ? 1 : Math.max((d.avgMin / maxResponseMin) * 100, 4)}%`,
                      }}
                      title={`${d.day}: ${d.avgMin === null ? "لا ردود" : `${d.avgMin.toFixed(1)} دقيقة`}`}
                    />
                    <span className="text-[9px] text-muted-foreground">{d.day}</span>
                  </div>
                ))}
              </div>
            )}
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

        {/* استهلاك الباقة شهرياً */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">استهلاك الباقة شهرياً — آخر ٦ أشهر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentUsage && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <span className="font-medium">المتبقي هذا الشهر:</span>
                <Badge variant="secondary">
                  {Math.max(currentUsage.messageLimit - currentUsage.messagesUsed, 0)} رسالة من {currentUsage.messageLimit}
                </Badge>
                <Badge variant="secondary">
                  {Math.max(currentUsage.tokenLimit - currentUsage.tokensUsed, 0).toLocaleString("ar")} توكن من {currentUsage.tokenLimit.toLocaleString("ar")}
                </Badge>
              </div>
            )}
            {usageMonths.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد سجلات استهلاك بعد.</p>
            ) : (
              <>
                <div className="flex h-40 items-end gap-2">
                  {usageMonths.map((u) => (
                    <div key={u.month} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">
                        {u.messagesUsed}/{u.messageLimit}
                      </span>
                      <div className="flex w-full flex-1 items-end justify-center gap-1">
                        <div
                          className="w-1/3 rounded-t bg-primary/80"
                          style={{ height: `${Math.max((u.messagesUsed / maxMessages) * 100, u.messagesUsed > 0 ? 4 : 1)}%` }}
                          title={`رسائل: ${u.messagesUsed} من ${u.messageLimit}`}
                        />
                        <div
                          className="w-1/3 rounded-t bg-muted-foreground/40"
                          style={{ height: `${Math.max((u.messageLimit / maxMessages) * 100, 1)}%` }}
                          title={`حد الرسائل: ${u.messageLimit}`}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{monthName(u.month)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary/80" />
                    رسائل مستخدمة
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
                    حد الرسائل
                  </span>
                  <span className="ms-auto">
                    أعلى استهلاك توكنات: {Math.max(...usageMonths.map((u) => u.tokensUsed), 0).toLocaleString("ar")} /
                    حد {maxTokens.toLocaleString("ar")}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
