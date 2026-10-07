import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveWhatsAppCreds } from "@/lib/whatsapp";
import { getUsageStatus } from "@/lib/billing/plans";
import {
  buildAudienceWhere,
  parseAudience,
  sendBroadcast,
  type BroadcastAudience,
} from "@/lib/broadcast";
import { logAudit } from "@/lib/audit";

// حد جمهور الحملة الواحدة — يحافظ على اكتمال الإرسال ضمن مهلة Vercel
const MAX_AUDIENCE = 500;

// حملات البث الجماعي لمساحة العمل — الأحدث أولاً، مع عدد النقرات لكل حملة
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  // معاينة حجم الجمهور: /api/broadcasts/audience?tags=a,b&stage=X&inactiveDays=N
  const { searchParams } = new URL(req.url);
  if (searchParams.has("audience")) {
    const audience = parseAudience({
      tags: searchParams.get("tags")?.split(",").map((t) => t.trim()).filter(Boolean) ?? [],
      stage: searchParams.get("stage") || null,
      inactiveDays: Number(searchParams.get("inactiveDays")) || null,
    });
    if (
      audience.tags.length === 0 &&
      !audience.stage &&
      audience.inactiveDays == null
    ) {
      return NextResponse.json(
        { error: "حدّد معيار استهداف واحداً على الأقل" },
        { status: 400 }
      );
    }
    const where = buildAudienceWhere(ctx.workspaceId, audience);
    const [count, total] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.count({ where: { workspaceId: ctx.workspaceId } }),
    ]);
    return NextResponse.json({
      count: Math.min(count, MAX_AUDIENCE + 1),
      capped: count > MAX_AUDIENCE,
      totalContacts: total,
    });
  }

  const campaigns = await prisma.broadcastCampaign.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const clicks = await prisma.broadcastClick.groupBy({
    by: ["campaignId"],
    _count: true,
  });
  const clickCountByCampaign = new Map(
    clicks.map((c) => [c.campaignId, c._count])
  );
  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      ...c,
      clickCount: clickCountByCampaign.get(c.id) ?? 0,
    })),
  });
}

// إنشاء حملة وإرسالها فوراً أو جدولتها لوقت مستقبلي
// audience: استهداف مركّب {tags[], stage, inactiveDays} — معيار واحد على الأقل
// tag (قديم): تسمية واحدة — تُحوَّل لـ audience {tags:[tag]} للتوافق الخلفي
// linkUrl: رابط عرض — يُدرج مكان {{link}} في النص كرابط تتبّع لكل عميل
// templateId: قالب معتمد في ميتا (متغيراته {{n}} تُقيم من params)
// params: قيم المتغيرات على مستوى الحملة — تدعم {{name}} للتخصيص باسم كل عميل
// scheduledAt: موعد الإرسال بصيغة ISO — غائب أو فارغ يعني الإرسال فوراً
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الحملات للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const text = body?.body?.trim();
  const templateId = body?.templateId ?? null;
  const params: string[] = Array.isArray(body?.params)
    ? body.params.map((p: unknown) => String(p ?? ""))
    : [];
  const scheduledAtRaw = body?.scheduledAt?.trim?.() ?? "";
  if (!text) {
    return NextResponse.json(
      { error: "نص الرسالة مطلوب" },
      { status: 400 }
    );
  }

  // الاستهداف: audience المركّب، أو tag الواحد القديم
  let audience: BroadcastAudience;
  if (body?.audience && typeof body.audience === "object") {
    audience = parseAudience(body.audience);
  } else {
    const legacyTag = body?.tag?.trim?.() ?? "";
    audience = { tags: legacyTag ? [legacyTag] : [], stage: null, inactiveDays: null };
  }
  if (
    audience.tags.length === 0 &&
    !audience.stage &&
    audience.inactiveDays == null
  ) {
    return NextResponse.json(
      { error: "حدّد معيار استهداف واحداً على الأقل: تسمية أو مرحلة أو خمول" },
      { status: 400 }
    );
  }

  // رابط العرض الاختياري: يُدرج مكان {{link}} كرابط تتبّع لكل عميل
  const linkUrl: string | null =
    typeof body?.linkUrl === "string" && body.linkUrl.trim()
      ? body.linkUrl.trim()
      : null;

  // التحقق من صلاحية موعد الجدولة إن أُعطي
  let scheduledAt: Date | null = null;
  if (scheduledAtRaw) {
    scheduledAt = new Date(scheduledAtRaw);
    if (isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      return NextResponse.json(
        { error: "موعد الجدولة غير صالح — يجب أن يكون وقتاً مستقبلياً" },
        { status: 400 }
      );
    }
  }

  // التحقق المبكر من بيانات واتساب قبل إنشاء الحملة
  const creds = await resolveWhatsAppCreds(ctx.workspaceId);
  if (!creds) {
    return NextResponse.json(
      { error: "بيانات واتساب غير مضبوطة لهذه المساحة" },
      { status: 400 }
    );
  }

  // القالب إن اختير: يجب أن ينتمي لنفس مساحة العمل — متغيراته {{n}} تُقيم من params
  let template: { id: string; name: string; language: string; body: string } | null =
    null;
  if (templateId) {
    template = await prisma.template.findFirst({
      where: { id: templateId, workspaceId: ctx.workspaceId },
    });
    if (!template) {
      return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
    }
  }

  // جمهور الحملة بالشرط المركّب الموحّد
  const audienceWhere = buildAudienceWhere(ctx.workspaceId, audience);
  const contacts = await prisma.contact.findMany({
    where: audienceWhere,
    select: { id: true, waPhone: true },
    take: MAX_AUDIENCE + 1,
  });
  if (contacts.length === 0) {
    return NextResponse.json(
      { error: "لا توجد جهات اتصال تطابق معايير الاستهداف" },
      { status: 400 }
    );
  }
  if (contacts.length > MAX_AUDIENCE) {
    return NextResponse.json(
      { error: `جمهور الحملة يتجاوز الحد الأقصى (${MAX_AUDIENCE}) — اضبط المعايير لتضييقه` },
      { status: 400 }
    );
  }

  // حد الباقة للإرسال الفوري: الرصيد المتبقي يجب أن يكفي لحجم الجمهور
  // (الحملات المجدولة تُفحص مجدداً لحظة إرسالها عبر cron)
  if (!scheduledAt) {
    const usage = await getUsageStatus(ctx.workspaceId);
    if (usage.remaining < contacts.length) {
      return NextResponse.json(
        {
          error: `رصيدك المتبقي (${usage.remaining} رسالة) لا يكفي لجمهور ${contacts.length} — رقِّ باقتك من صفحة الاشتراك`,
        },
        { status: 400 }
      );
    }
  }

  const campaign = await prisma.broadcastCampaign.create({
    data: {
      workspaceId: ctx.workspaceId,
      // التسمية المخزّنة = أول تسميات الاستهداف (مطلوبة — عمود NOT NULL للتوافق الخلفي)
      tag: audience.tags[0] ?? "",
      audience: JSON.stringify(audience),
      linkUrl,
      body: text,
      templateId: template?.id ?? null,
      status: scheduledAt ? "QUEUED" : "SENDING",
      scheduledAt,
      params,
      totalCount: contacts.length,
      createdById: ctx.userId,
    },
  });

  // تدقيق إنشاء الحملة بملخص الاستهداف (بدون محتوى الرسالة)
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "CREATE",
    entity: "broadcast",
    entityId: campaign.id,
    meta: {
      audience: {
        tags: audience.tags,
        stage: audience.stage,
        inactiveDays: audience.inactiveDays,
      },
      recipients: contacts.length,
      scheduled: Boolean(scheduledAt),
    },
  });

  // الإرسال الفوري — الحملة المجدولة تنتظر cron /api/cron/broadcasts
  if (!scheduledAt) {
    await sendBroadcast(campaign.id);
  }

  const updated = await prisma.broadcastCampaign.findUnique({
    where: { id: campaign.id },
  });
  return NextResponse.json({ campaign: updated }, { status: 201 });
}
