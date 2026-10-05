import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  resolveWhatsAppCreds,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";
import { getUsageStatus } from "@/lib/billing/plans";

// حد جمهور الحملة الواحدة — يحافظ على اكتمال الإرسال ضمن مهلة Vercel
const MAX_AUDIENCE = 500;

// مفتاح الشهر الحالي لسجل الاستهلاك
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

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

// إنشاء حملة وإرسالها فوراً لكل جهات الاتصال الحاملة للتسمية
// templateId: قالب معتمد في ميتا (يجب أن يكون بلا متغيرات للبث الجماعي)
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const tag = body?.tag?.trim();
  const text = body?.body?.trim();
  const templateId = body?.templateId ?? null;
  if (!tag || !text) {
    return NextResponse.json(
      { error: "التسمية ونص الرسالة مطلوبان" },
      { status: 400 }
    );
  }

  // التحقق المبكر من بيانات واتساب قبل إنشاء الحملة
  const creds = await resolveWhatsAppCreds(ctx.workspaceId);
  if (!creds) {
    return NextResponse.json(
      { error: "بيانات واتساب غير مضبوطة لهذه المساحة" },
      { status: 400 }
    );
  }

  // القالب إن اختير: يجب أن يكون بلا متغيرات — لا تخصيص جماعي لكل عميل بعد
  let template: { id: string; name: string; language: string; body: string } | null =
    null;
  if (templateId) {
    template = await prisma.template.findFirst({
      where: { id: templateId, workspaceId: ctx.workspaceId },
    });
    if (!template) {
      return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
    }
    if (/\{\{\d+\}\}/.test(template.body)) {
      return NextResponse.json(
        { error: "قوالب الحملات يجب أن تكون بلا متغيرات {{1}} — أزل المتغيرات أو أنشئ قالباً ثابتاً" },
        { status: 400 }
      );
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

  // حد الباقة: الرصيد المتبقي يجب أن يكفي لحجم الجمهور
  const usage = await getUsageStatus(ctx.workspaceId);
  if (usage.remaining < contacts.length) {
    return NextResponse.json(
      {
        error: `رصيدك المتبقي (${usage.remaining} رسالة) لا يكفي لجمهور ${contacts.length} — رقِّ باقتك من صفحة الاشتراك`,
      },
      { status: 400 }
    );
  }

  const campaign = await prisma.broadcastCampaign.create({
    data: {
      workspaceId: ctx.workspaceId,
      tag,
      body: text,
      templateId: template?.id ?? null,
      totalCount: contacts.length,
      createdById: ctx.userId,
    },
  });

  // الإرسال المتسلسل مع تحديث العدّادات — لا ننشئ سجلات Message (تلويث للمحادثات)
  let sent = 0;
  let failed = 0;
  const month = currentMonth();
  for (const contact of contacts) {
    const ok = template
      ? await sendWhatsAppTemplate(
          contact.waPhone,
          { name: template.name, language: template.language, params: [] },
          creds
        )
      : await sendWhatsAppMessage(contact.waPhone, text, creds);
    if (ok) sent++;
    else failed++;
    await prisma.$transaction([
      prisma.broadcastCampaign.update({
        where: { id: campaign.id },
        data: {
          sentCount: sent,
          failedCount: failed,
          status: "SENDING",
        },
      }),
      prisma.usageRecord.upsert({
        where: { workspaceId_month: { workspaceId: ctx.workspaceId, month } },
        update: { messagesUsed: { increment: 1 } },
        create: { workspaceId: ctx.workspaceId, month, messagesUsed: 1 },
      }),
    ]);
  }

  const status = failed === 0 ? "SENT" : sent === 0 ? "FAILED" : "PARTIAL";
  const updated = await prisma.broadcastCampaign.update({
    where: { id: campaign.id },
    data: { status },
  });

  return NextResponse.json({ campaign: updated }, { status: 201 });
}
