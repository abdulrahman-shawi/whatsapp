import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

// ويب هوك Stripe العام — بدون مصادقة: يفعّل الباقة ويسجّل الفاتورة عند نجاح الدفع
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  if (!secret || !stripe) {
    return NextResponse.json({ error: "غير مهيأ" }, { status: 500 });
  }

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "توقيع غير صالح" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId ?? null;
      const planId = session.metadata?.planId ?? null;
      if (workspaceId) {
        if (planId) {
          await prisma.workspace.update({
            where: { id: workspaceId },
            data: { planId },
          });
        }
        await prisma.invoice.upsert({
          where: { stripeSessionId: session.id },
          update: {
            planId,
            amount: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            status: "PAID",
          },
          create: {
            workspaceId,
            planId,
            amount: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            status: "PAID",
            stripeSessionId: session.id,
          },
        });
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await prisma.invoice.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: "FAILED" },
      });
    }
  } catch (err) {
    console.error("stripe webhook processing error", err);
  }

  return NextResponse.json({ received: true });
}
