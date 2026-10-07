import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendBroadcast } from "@/lib/broadcast";
import { logAudit } from "@/lib/audit";

// إرسال حملة مجدولة فوراً: يبدّلها من QUEUED إلى الإرسال المباشر
// (زر "إرسال الآن" في واجهة الحملات)
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الحملات للمالك فقط" }, { status: 403 });
  }

  const campaign = await prisma.broadcastCampaign.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!campaign) {
    return NextResponse.json({ error: "الحملة غير موجودة" }, { status: 404 });
  }
  if (campaign.status !== "QUEUED") {
    return NextResponse.json(
      { error: "لا يمكن إرسال الحملة — ليست في حالة مجدولة" },
      { status: 400 }
    );
  }

  // إلغاء الجدولة ثم الإرسال الفوري
  await prisma.broadcastCampaign.update({
    where: { id: campaign.id },
    data: { scheduledAt: null },
  });
  await sendBroadcast(campaign.id);

  // تدقيق الإرسال الفوري لحملة مجدولة
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "SEND",
    entity: "broadcast",
    entityId: campaign.id,
  });

  const updated = await prisma.broadcastCampaign.findUnique({
    where: { id: campaign.id },
  });
  return NextResponse.json({ campaign: updated });
}
