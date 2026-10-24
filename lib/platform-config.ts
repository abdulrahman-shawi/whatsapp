import { prisma } from "@/lib/prisma";

// إعدادات مالك المنصة — تُدار من لوحة /admin وتتقدّم على متغيرات البيئة
export const PLATFORM_CONFIG_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_PRO",
  "STRIPE_PRICE_BUSINESS",
  "SUPPORT_WHATSAPP",
  // مفاتيح الذكاء الاصطناعي الافتراضية — يستخدمها كل مساحات العمل التي لم تضبط قيمها الخاصة
  "OPENAI_API_KEY",
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_BASE_URL",
] as const;

export type PlatformConfig = Record<(typeof PLATFORM_CONFIG_KEYS)[number], string>;

const ENV_FALLBACK: PlatformConfig = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  STRIPE_PRICE_STARTER: process.env.STRIPE_PRICE_STARTER ?? "",
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO ?? "",
  STRIPE_PRICE_BUSINESS: process.env.STRIPE_PRICE_BUSINESS ?? "",
  SUPPORT_WHATSAPP: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  AI_PROVIDER: process.env.AI_PROVIDER ?? "",
  AI_MODEL: process.env.AI_MODEL ?? "",
  AI_BASE_URL: process.env.AI_BASE_URL ?? "",
};

// ذاكرة قصيرة (٦٠ ثانية) كي لا نضرب قاعدة البيانات عند كل طلب دفع
let cache: { at: number; config: PlatformConfig } | null = null;

// جمع الإعدادات: قاعدة البيانات تتقدّم، ومتغيرات البيئة بديل عند الغياب
export async function getPlatformConfig(): Promise<PlatformConfig> {
  if (cache && Date.now() - cache.at < 60_000) return cache.config;
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: [...PLATFORM_CONFIG_KEYS] } },
  });
  const fromDb = new Map(rows.map((r) => [r.key, r.value]));
  const config = Object.fromEntries(
    PLATFORM_CONFIG_KEYS.map((k) => [k, fromDb.get(k)?.trim() || ENV_FALLBACK[k]])
  ) as PlatformConfig;
  cache = { at: Date.now(), config };
  return config;
}

// إبطال الذاكرة بعد حفظ الإعدادات من لوحة المنصة
export function invalidatePlatformConfigCache(): void {
  cache = null;
}

// إظهار مقنّع للأسرار: أول ٦ وآخر ٤ رموز فقط
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 10) return "•".repeat(value.length);
  return `${value.slice(0, 6)}${"•".repeat(Math.max(4, value.length - 10))}${value.slice(-4)}`;
}
