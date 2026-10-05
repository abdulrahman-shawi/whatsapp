import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveWhatsAppCreds } from "@/lib/whatsapp";
import { getUsageStatus } from "@/lib/billing/plans";
import { sendBroadcast } from "@/lib/broadcast";

// حد جمهور الحملة الواحدة — يحافظ على اكتمال الإرسال ضمن مهلة Vercel
const MAX_AUDIENCE = 500;

// حملات البث الجماعي لمساحة العمل — الأحدث أولاً
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const campaigns = await prisma.broadcastCampaign.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ campaigns });
}

// إنشاء حملة وإرسالها فوراً أو جدولتها لوقت مستقبلي
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
  const tag = body?.tag?.trim();
  const text = body?.body?.trim();
  const templateId = body?.templateId ?? null;
  const params: string[] = Array.isArray(body?.params)
    ? body.params.map((p: unknown) => String(p ?? ""))
    : [];
  const scheduledAtRaw = body?.scheduledAt?.trim?.() ?? "";
  if (!tag || !text) {
    return NextResponse.json(
      { error: "التسمية ونص الرسالة مطلوبان" },
      { status: 400 }
    );
  }

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

  // جمهور الحملة: جهات الاتصال الحاملة للتسمية
  const contacts = await prisma.contact.findMany({
    where: { workspaceId: ctx.workspaceId, tags: { has: tag } },
    select: { id: true, waPhone: true },
    take: MAX_AUDIENCE + 1,
  });
  if (contacts.length === 0) {
    return NextResponse.json(
      { error: `لا توجد جهات اتصال تحمل التسمية "${tag}"` },
      { status: 400 }
    );
  }
  if (contacts.length > MAX_AUDIENCE) {
    return NextResponse.json(
      { error: `جمهور الحملة يتجاوز الحد الأقصى (${MAX_AUDIENCE}) — قسّمه لتسميات أصغر` },
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
      tag,
      body: text,
      templateId: template?.id ?? null,
      status: scheduledAt ? "QUEUED" : "SENDING",
      scheduledAt,
      params,
      totalCount: contacts.length,
      createdById: ctx.userId,
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
