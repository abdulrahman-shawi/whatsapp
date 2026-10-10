import { prisma } from "@/lib/prisma";
import type { ContactStage } from "@prisma/client";

// تسجيل تغيّر مرحلة العميل في مسار البيع — سجل لا يفشل صاحبه أبداً:
// أي خطأ يُبتلع هنا لأن السجل تجميلي بالنسبة لمسار البيع الرئيسي
export async function recordStageChange(
  contactId: string,
  stage: ContactStage,
  source: "manual" | "workflow" | "form" | string
): Promise<void> {
  try {
    await prisma.contactStageHistory.create({
      data: { contactId, stage, source },
    });
  } catch (e) {
    console.error("[stage-history] تعذّر تسجيل تغيّر المرحلة:", e);
  }
}
