import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ensurePlansSeeded } from "@/lib/billing/plans";

// بريدات مالك المنصة من .env — مفصولة بفواصل
function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// التحقق أن المستخدم الحالي مدير المنصة
async function isPlatformAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return !!user && adminEmails().includes(user.email.toLowerCase());
}

// تعيين باقة لمساحة عمل — التفعيل اليدوي من مالك المنصة
// عند إضافة Stripe لاحقاً سيصبح هذا المسار هو ما يستدعيه webhook
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (!(await isPlatformAdmin(ctx.userId))) {
    return NextResponse.json({ error: "مدير المنصة فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const planCode = body?.planCode?.trim();
  if (!planCode) {
    return NextResponse.json({ error: "رمز الباقة مطلوب" }, { status: 400 });
  }

  await ensurePlansSeeded();
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) {
    return NextResponse.json({ error: "باقة غير معروفة" }, { status: 400 });
  }

  // بلا workspaceId: تعيين لمساحة عمل المدير الحالية
  const workspaceId = body?.workspaceId ?? ctx.workspaceId;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "مساحة العمل غير موجودة" }, { status: 404 });
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { planId: plan.id },
  });
  return NextResponse.json({ ok: true, plan: plan.code });
}
