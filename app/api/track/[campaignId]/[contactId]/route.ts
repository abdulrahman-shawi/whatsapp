import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { variantForContact } from "@/lib/broadcast";

// رابط التتبّع العام (بلا مصادقة): يسجّل نقرة العميل على حملة ثم يحوّله لرابط العرض
// GET /api/track/[campaignId]/[contactId]?u=<url>
export async function GET(
  req: Request,
  { params }: { params: { campaignId: string; contactId: string } }
) {
  const target = new URL(req.url).searchParams.get("u");
  const dest =
    target && /^https?:\/\//i.test(target) ? target : new URL("/", req.url).toString();

  try {
    // نسخة العميل تُعاد حسابتها بنفس دالة التقسيم الحتمية المستعملة عند الإرسال
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: params.campaignId },
      select: { bodyB: true },
    });
    const variant = variantForContact(
      params.contactId,
      Boolean(campaign?.bodyB?.trim())
    );
    await prisma.broadcastClick.upsert({
      where: {
        campaignId_contactId: {
          campaignId: params.campaignId,
          contactId: params.contactId,
        },
      },
      // أول نقرة فقط تُسجَّل — إعادة الزيارة تحدّث وقتها
      update: {},
      create: {
        campaignId: params.campaignId,
        contactId: params.contactId,
        variant,
      },
    });
  } catch {
    // فشل التسجيل لا يمنع التحويل لرابط العرض
  }
  return NextResponse.redirect(dest, 302);
}
