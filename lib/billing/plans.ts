import { prisma } from "@/lib/prisma";

// مفتاح الشهر الحالي بصيغة "2025-01"
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// تعريف الباقات الثلاث — الأسعار للعرض في المرحلة اليدوية
export const PLAN_DEFINITIONS = [
  {
    code: "STARTER",
    name: "أساسية",
    priceMonthly: 0,
    messageLimit: 1000,
    maxMembers: 2,
    maxAgents: 1,
    sortOrder: 1,
  },
  {
    code: "PRO",
    name: "احترافية",
    priceMonthly: 19,
    messageLimit: 5000,
    maxMembers: 5,
    maxAgents: 3,
    sortOrder: 2,
  },
  {
    code: "BUSINESS",
    name: "أعمال",
    priceMonthly: 49,
    messageLimit: 20000,
    maxMembers: 15,
    maxAgents: 10,
    sortOrder: 3,
  },
] as const;

export type PlanCode = (typeof PLAN_DEFINITIONS)[number]["code"];

export type WorkspacePlan = {
  id: string;
  code: PlanCode;
  name: string;
  priceMonthly: number;
  messageLimit: number;
  maxMembers: number;
  maxAgents: number;
};

// التأكد من وجود الباقات في قاعدة البيانات — idempotent
export async function ensurePlansSeeded(): Promise<void> {
  for (const def of PLAN_DEFINITIONS) {
    await prisma.plan.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        priceMonthly: def.priceMonthly,
        messageLimit: def.messageLimit,
        maxMembers: def.maxMembers,
        maxAgents: def.maxAgents,
        sortOrder: def.sortOrder,
      },
      create: { ...def },
    });
  }
}

// باقة مساحة العمل الفعلية: المعيّنة أو الافتراضية (STARTER)
// ملاحظة مستقبلية: عند إضافة Stripe، يُحدَّث workspace.planId من webhook
// بعد نجاح checkout ويُرفق هنا منطق الترقية/التخفيض
export async function getWorkspacePlan(
  workspaceId: string
): Promise<WorkspacePlan> {
  await ensurePlansSeeded();
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { plan: true },
  });
  if (workspace?.plan) {
    return workspace.plan as WorkspacePlan;
  }
  const starter = await prisma.plan.findUnique({ where: { code: "STARTER" } });
  return starter as WorkspacePlan;
}

export type UsageStatus = {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
};

// حالة الاستهلاك الشهري: المستهلكة من UsageRecord والحد من الباقة
export async function getUsageStatus(workspaceId: string): Promise<UsageStatus> {
  const [plan, record] = await Promise.all([
    getWorkspacePlan(workspaceId),
    prisma.usageRecord.findUnique({
      where: {
        workspaceId_month: { workspaceId, month: currentMonth() },
      },
    }),
  ]);
  const used = record?.messagesUsed ?? 0;
  const limit = plan.messageLimit;
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    percent: Math.min(Math.round((used / limit) * 100), 100),
  };
}
