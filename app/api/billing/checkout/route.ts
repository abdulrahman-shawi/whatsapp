import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ensurePlansSeeded } from "@/lib/billing/plans";
import { getStripe, planPriceEnv, stripeConfigured } from "@/lib/stripe";

// إنشاء جلسة دفع Stripe لاشتراك باقة — يفعَّل الباقة تلقائياً عبر webhook النجاح
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "مالك مساحة العمل فقط" }, { status: 403 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "بوابة الدفع غير مضبوطة بعد" },
      { status: 400 }
    );
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

  const price = planPriceEnv(plan.code);
  if (!price) {
    return NextResponse.json(
      { error: "سعر هذه الباقة غير مضبوط في Stripe" },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "بوابة الدفع غير مهيأة" }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/billing?canceled=1`,
    client_reference_id: ctx.workspaceId,
    metadata: { workspaceId: ctx.workspaceId, planId: plan.id },
  });

  return NextResponse.json({ url: session.url });
}
