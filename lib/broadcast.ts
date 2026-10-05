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

// الإرسال الفعلي للحملة: يُستدعى فوراً من مسار الإنشاء أو لاحقاً من cron الجدولة
// يحدّث عدّادات الحملة وحالتها ويسجّل الاستهلاك الشهري
export async function sendBroadcast(campaignId: string): Promise<void> {
  const campaign = await prisma.broadcastCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) return;

  // القالب إن وُجد: يجب أن ينتمي لنفس مساحة العمل
  let template: { name: string; language: string } | null = null;
  if (campaign.templateId) {
    template = await prisma.template.findFirst({
      where: { id: campaign.templateId, workspaceId: campaign.workspaceId },
      select: { name: true, language: true },
    });
  }

  // جمهور الحملة: جهات الاتصال الحاملة للتسمية في مساحة العمل
  const contacts = await prisma.contact.findMany({
    where: { workspaceId: campaign.workspaceId, tags: { has: campaign.tag } },
    select: { id: true, waPhone: true, name: true },
    take: MAX_AUDIENCE + 1,
  });

  const creds = await resolveWhatsAppCreds(campaign.workspaceId);

  // حد الباقة: الرصيد المتبقي يجب أن يكفي لحجم الجمهور قبل أي إرسال
  const usage = await getUsageStatus(campaign.workspaceId);
  if (usage.remaining < contacts.length) {
    // رصيد غير كافٍ: نفشل الحملة كاملة دون إرسال أي رسالة
    await prisma.broadcastCampaign.update({
      where: { id: campaign.id },
      data: { status: "FAILED", failedCount: campaign.totalCount, sentAt: new Date() },
    });
    return;
  }

  await prisma.broadcastCampaign.update({
    where: { id: campaign.id },
    data: { status: "SENDING" },
  });

  // الإرسال المتسلسل مع تحديث العدّادات — لا ننشئ سجلات Message (تلويث للمحادثات)
  let sent = 0;
  let failed = 0;
  const month = currentMonth();
  for (const contact of contacts) {
    // اسم العميل المعروض: الاسم إن وُجد وإلا رقمه — يُدرج مكان {{name}}
    const displayName = contact.name ?? contact.waPhone;
    const ok =
      creds &&
      (template
        ? // تخصيص قيم المتغيرات لكل عميل: {{name}} داخل أي قيمة تُستبدل باسم العميل
          await sendWhatsAppTemplate(
            contact.waPhone,
            {
              name: template.name,
              language: template.language,
              params: campaign.params.map((p) =>
                p.replaceAll("{{name}}", displayName)
              ),
            },
            creds
          )
        : // الرسائل النصية: استبدال {{name}} باسم العميل لكل مستلم
          await sendWhatsAppMessage(
            contact.waPhone,
            campaign.body.replaceAll("{{name}}", displayName),
            creds
          ));
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
        where: {
          workspaceId_month: { workspaceId: campaign.workspaceId, month },
        },
        update: { messagesUsed: { increment: 1 } },
        create: { workspaceId: campaign.workspaceId, month, messagesUsed: 1 },
      }),
    ]);
  }

  const status = failed === 0 ? "SENT" : sent === 0 ? "FAILED" : "PARTIAL";
  await prisma.broadcastCampaign.update({
    where: { id: campaign.id },
    data: { status, sentAt: new Date() },
  });
}
