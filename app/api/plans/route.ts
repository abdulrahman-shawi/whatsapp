import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePlansSeeded } from "@/lib/billing/plans";

// الباقات المتاحة للعرض العام — صفحة الهبوط ونموذج التسجيل (بدون مصادقة)
export async function GET() {
  await ensurePlansSeeded();
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      name: true,
      priceMonthly: true,
      messageLimit: true,
      tokenLimit: true,
      maxMembers: true,
      maxAgents: true,
    },
  });
  return NextResponse.json({ plans });
}
