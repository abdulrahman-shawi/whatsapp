import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
      },
    });
  } catch {
    // فشل التسجيل لا يمنع التحويل لرابط العرض
  }
  return NextResponse.redirect(dest, 302);
}
