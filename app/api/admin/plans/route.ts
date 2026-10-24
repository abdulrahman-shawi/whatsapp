import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePlansSeeded } from "@/lib/billing/plans";

// بريدات مالك المنصة من .env — مفصولة بفواصل
function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// تعيين باقة لمساحة عمل — التفعيل اليدوي من مالك المنصة
// عند إضافة Stripe لاحقاً سيصبح هذا المسار هو ما يستدعيه webhook
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !adminEmails().includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: "مدير المنصة فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const planCode = typeof payload.planCode === "string" ? payload.planCode.trim() : "";
  const workspaceId =
    typeof payload.workspaceId === "string" ? payload.workspaceId.trim() : "";
  if (!planCode || !workspaceId) {
    return NextResponse.json(
      { error: "رمز الباقة ومساحة العمل مطلوبان" },
      { status: 400 }
    );
  }

  await ensurePlansSeeded();
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) {
    return NextResponse.json({ error: "باقة غير معروفة" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "مساحة العمل غير موجودة" }, { status: 404 });
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { planId: plan.id, trialEndsAt: null },
  });
  return NextResponse.json({ ok: true, plan: plan.code });
}
