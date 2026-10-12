import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PLATFORM_CONFIG_KEYS,
  getPlatformConfig,
  invalidatePlatformConfigCache,
  maskSecret,
} from "@/lib/platform-config";

// بريدات مالك المنصة من .env — مفصولة بفواصل
function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function requirePlatformAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  if (!user || !adminEmails().includes(user.email.toLowerCase())) return null;
  return user;
}

// عرض الإعدادات مقنّعة — أسرار لا تُعاد كاملة أبداً
export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "مدير المنصة فقط" }, { status: 403 });

  const config = await getPlatformConfig();
  const masked = Object.fromEntries(
    PLATFORM_CONFIG_KEYS.map((k) => [
      k,
      k === "SUPPORT_WHATSAPP" ? config[k] : maskSecret(config[k]),
    ])
  );
  return NextResponse.json({ config: masked });
}

// حفظ الإعدادات — أي حقل فارغ يعني: احذف القيمة من قاعدة البيانات والتزم بمتغير البيئة
export async function PUT(req: Request) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "مدير المنصة فقط" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const WHATSAPP_RE = /^[0-9+\s]{6,20}$/;
  const updates: { key: string; value: string }[] = [];
  const removals: string[] = [];

  for (const key of PLATFORM_CONFIG_KEYS) {
    const raw = (body as Record<string, unknown>)[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      return NextResponse.json({ error: `قيمة غير صالحة: ${key}` }, { status: 400 });
    }
    const value = raw.trim();
    if (value === "") {
      removals.push(key);
      continue;
    }
    if (key.startsWith("STRIPE_PRICE") && !/^price_[A-Za-z0-9]+$/.test(value)) {
      return NextResponse.json(
        { error: "معرّفات أسعار Stripe تبدأ بـ price_" },
        { status: 400 }
      );
    }
    if (key === "SUPPORT_WHATSAPP" && !WHATSAPP_RE.test(value)) {
      return NextResponse.json(
        { error: "رقم واتساب الدعم غير صالح" },
        { status: 400 }
      );
    }
    updates.push({ key, value });
  }

  for (const { key, value } of updates) {
    await prisma.platformSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  for (const key of removals) {
    await prisma.platformSetting.deleteMany({ where: { key } });
  }

  invalidatePlatformConfigCache();
  return NextResponse.json({ ok: true });
}
