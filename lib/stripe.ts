import Stripe from "stripe";

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
