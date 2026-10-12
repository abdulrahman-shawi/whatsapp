import Stripe from "stripe";
import { getPlatformConfig } from "@/lib/platform-config";

// عميل Stripe يُهيأ عند أول استخدام فقط — لا يُرمى خطأ عند الاستيراد إن غاب المفتاح
let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) {
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// هل بوابة الدفع مضبوطة؟ (لإظهار زر الاشتراك أو الإبقاء على التفعيل اليدوي)
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// معرّف سعر Stripe لكل باقة — يُضبط في متغيرات البيئة بصيغة price_xxx
export function planPriceEnv(code: string): string | null {
  switch (code) {
    case "STARTER":
      return process.env.STRIPE_PRICE_STARTER ?? null;
    case "PRO":
      return process.env.STRIPE_PRICE_PRO ?? null;
    case "BUSINESS":
      return process.env.STRIPE_PRICE_BUSINESS ?? null;
    default:
      return null;
  }
}

// النسخ غير المتزامنة — تتقدّم إعدادات لوحة /admin (قاعدة البيانات) على متغيرات البيئة
// يُخزَّن العميل مع مفتاحه كي يُعاد إنشاؤه تلقائياً إذا غيّر المدير المفتاح من اللوحة
let _stripeWithKey: { key: string; client: Stripe } | null = null;

export async function getStripeAsync(): Promise<Stripe | null> {
  const config = await getPlatformConfig();
  const key = config.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripeWithKey || _stripeWithKey.key !== key) {
    _stripeWithKey = { key, client: new Stripe(key) };
  }
  return _stripeWithKey.client;
}

export async function stripeConfiguredAsync(): Promise<boolean> {
  const config = await getPlatformConfig();
  return !!config.STRIPE_SECRET_KEY;
}

export async function stripeWebhookSecretAsync(): Promise<string | null> {
  const config = await getPlatformConfig();
  return config.STRIPE_WEBHOOK_SECRET || null;
}

// معرّف سعر باقة من إعدادات المنصة ثم البيئة
export async function planPriceAsync(code: string): Promise<string | null> {
  const config = await getPlatformConfig();
  switch (code) {
    case "STARTER":
      return config.STRIPE_PRICE_STARTER || null;
    case "PRO":
      return config.STRIPE_PRICE_PRO || null;
    case "BUSINESS":
      return config.STRIPE_PRICE_BUSINESS || null;
    default:
      return null;
  }
}
