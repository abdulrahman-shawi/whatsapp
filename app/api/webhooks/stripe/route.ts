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
        // نحفظ معرّف الاشتراك في الإعدادات لنقدر عند إلغائه معرفة مساحة العمل المالكة
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null);
        if (subscriptionId) {
          await prisma.setting.upsert({
            where: {
              workspaceId_key: {
                workspaceId,
                key: "STRIPE_SUBSCRIPTION_ID",
              },
            },
            update: { value: subscriptionId },
            create: {
              workspaceId,
              key: "STRIPE_SUBSCRIPTION_ID",
              value: subscriptionId,
            },
          });
        }
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await prisma.invoice.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: "FAILED" },
      });
    } else if (event.type === "customer.subscription.deleted") {
      // إلغاء/انتهاء الاشتراك: نعكس معرّف الاشتراك لمساحة العمل عبر مفتاح الإعدادات
      // المخزَّن عند نجاح الدفع، ثم نعيد الباقة للافتراضية ونبلّغ الفريق
      const subscription = event.data.object as Stripe.Subscription;
      const setting = await prisma.setting.findFirst({
        where: { key: "STRIPE_SUBSCRIPTION_ID", value: subscription.id },
      });
      if (setting) {
        await prisma.workspace.update({
          where: { id: setting.workspaceId },
          data: { planId: null },
        });
        await prisma.setting
          .delete({
            where: {
              workspaceId_key: {
                workspaceId: setting.workspaceId,
                key: "STRIPE_SUBSCRIPTION_ID",
              },
            },
          })
          .catch(() => {});
        await prisma.notification
          .create({
            data: {
              workspaceId: setting.workspaceId,
              userId: null, // null = الفريق كله
              type: "SYSTEM",
              title: "إلغاء الاشتراك",
              body: "تم إلغاء الاشتراك — عادت حدود الرد الآلي إلى الافتراضية. جدّد اشتراكك من صفحة الفوترة.",
              link: "/settings",
            },
          })
          .catch(() => {});
      }
    } else if (event.type === "invoice.payment_failed") {
      // فشل دفعة تجديد: نعلّم الفاتورة المطابقة (إن وُجدت) ونطلب تحديث البطاقة
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.id) {
        const matched = await prisma.invoice.findMany({
          where: { stripeInvoiceId: invoice.id },
          select: { workspaceId: true },
        });
        if (matched.length > 0) {
          await prisma.invoice.updateMany({
            where: { stripeInvoiceId: invoice.id },
            data: { status: "FAILED" },
          });
          for (const row of matched) {
            await prisma.notification
              .create({
                data: {
                  workspaceId: row.workspaceId,
                  userId: null,
                  type: "SYSTEM",
                  title: "فشل عملية الدفع",
                  body: "فشلت عملية الدفع الأخيرة — حدّث بطاقة الدفع من صفحة الفوترة لتجنّب إيقاف الباقة.",
                  link: "/settings",
                },
              })
              .catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error("stripe webhook processing error", err);
  }

  return NextResponse.json({ received: true });
}
