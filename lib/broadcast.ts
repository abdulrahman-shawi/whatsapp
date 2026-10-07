import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  resolveWhatsAppCreds,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";
import { getUsageStatus } from "@/lib/billing/plans";
import { isContactStage, type ContactStageValue } from "@/lib/contact-stages";

// حد جمهور الحملة الواحدة — يحافظ على اكتمال الإرسال ضمن مهلة Vercel
const MAX_AUDIENCE = 500;

// استهداف الحملة المركّب: تسميات + مرحلة + خمول (لم يتفاعل منذ N يوم)
export type BroadcastAudience = {
  tags: string[];
  stage: ContactStageValue | null;
  inactiveDays: number | null;
};

// قراءة حقل audience JSON بأمان مع قيم افتراضية عند التلف
export function parseAudience(raw: unknown): BroadcastAudience {
  const empty: BroadcastAudience = { tags: [], stage: null, inactiveDays: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const obj = raw as Record<string, unknown>;
  const tags = Array.isArray(obj.tags)
    ? [...new Set(obj.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean))]
    : [];
  const stage = isContactStage(obj.stage) ? obj.stage : null;
  const inactiveDays =
    typeof obj.inactiveDays === "number" && obj.inactiveDays > 0
      ? Math.floor(obj.inactiveDays)
      : null;
  return { tags, stage, inactiveDays };
}

// بناء شرط الاستعلام الموحّد للجمهور — يُستخدم في الإرسال ومعاينة الحجم والتحقق عند الإنشاء
// خمول N يوم: لا محادثة نشطة (lastMessageAt بعد القطع) — يشمل من ليس لديه محادثات أصلاً
export function buildAudienceWhere(
  workspaceId: string,
  audience: BroadcastAudience
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { workspaceId };
  if (audience.tags.length > 0) where.tags = { hasSome: audience.tags };
  if (audience.stage) where.stage = audience.stage;
  if (audience.inactiveDays != null) {
    const cutoff = new Date(Date.now() - audience.inactiveDays * 86400000);
    where.conversations = { none: { lastMessageAt: { gt: cutoff } } };
  }
  return where;
}

// قاعدة رابط التتبّع — فارغة إن لم تُضبط بيئة النشر (يسقط حينها لرابط العرض المجرد)
export function trackingBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  );
}

// مفتاح الشهر الحالي لسجل الاستهلاك
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// تخصيص نص الرسالة لكل عميل: {{name}} باسمه المعروض و{{link}} برابط التتبّع (إن وُجد)
function personalize(body: string, displayName: string, link: string | null): string {
  let text = body.replaceAll("{{name}}", displayName);
  if (link) text = text.replaceAll("{{link}}", link);
  return text;
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

  // جمهور الحملة: الاستهداف المركّب (تسميات + مرحلة + خمول)
  // توافق خلفي: حملات قديمة بلا audience تُدار بتسميتها المخزّنة
  let audience = parseAudience(campaign.audience);
  if (
    audience.tags.length === 0 &&
    !audience.stage &&
    audience.inactiveDays == null &&
    campaign.tag
  ) {
    audience = { ...audience, tags: [campaign.tag] };
  }
  const contacts = await prisma.contact.findMany({
    where: buildAudienceWhere(campaign.workspaceId, audience),
    select: { id: true, waPhone: true, name: true },
    take: MAX_AUDIENCE + 1,
  });

  // رابط التتبّع لكل عميل: {{link}} تُستبدل برابط يمر عبر /api/track ثم يحوّل للعرض
  const base = trackingBaseUrl();
  const linkFor = (contactId: string) =>
    campaign.linkUrl
      ? base
        ? `${base}/api/track/${campaign.id}/${contactId}?u=${encodeURIComponent(campaign.linkUrl)}`
        : campaign.linkUrl
      : null;

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
        : // الرسائل النصية: استبدال {{name}} باسم العميل و{{link}} برابط التتبّع لكل مستلم
          await sendWhatsAppMessage(
            contact.waPhone,
            personalize(campaign.body, displayName, linkFor(contact.id)),
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
