import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getIntegrationList,
  integrationSecretContext,
  isIntegrationKey,
  isSecretIntegrationKey,
} from "@/lib/settings";
import { encryptSecret } from "@/lib/secret-crypto";
import { logAudit } from "@/lib/audit";

// قائمة مفاتيح التكامل مقنّعة مع مصدر كل منها
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const integrations = await getIntegrationList(ctx.workspaceId);
  return NextResponse.json({ integrations });
}

// حفظ المفاتيح: القيم غير الفارغة تُحدَّث، والفارغة تُحذف (عودة لـ .env)
export async function PUT(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  for (const [key, value] of Object.entries(body)) {
    // القبول للمفاتيح المعروفة فقط
    if (!isIntegrationKey(key) || typeof value !== "string") {
      return NextResponse.json(
        { error: `مفتاح غير معروف: ${key}` },
        { status: 400 }
      );
    }

    const normalizedValue = value.trim();
    if (
      (key === "BUSINESS_HOURS_START" || key === "BUSINESS_HOURS_END") &&
      normalizedValue &&
      (!/^\d{1,2}$/.test(normalizedValue) ||
        Number(normalizedValue) < 0 ||
        Number(normalizedValue) > 23)
    ) {
      return NextResponse.json(
        { error: "ساعات العمل يجب أن تكون أرقاماً صحيحة بين 0 و23" },
        { status: 400 }
      );
    }
    if (
      key === "BUSINESS_HOURS_DAYS" &&
      normalizedValue &&
      normalizedValue.split(",").some((day) => !/^[0-6]$/.test(day.trim()))
    ) {
      return NextResponse.json(
        { error: "أيام العمل يجب أن تكون أرقاماً من 0 إلى 6 مفصولة بفواصل" },
        { status: 400 }
      );
    }
    if (
      key === "BUSINESS_HOURS_TIMEZONE" &&
      normalizedValue
    ) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: normalizedValue }).format();
      } catch {
        return NextResponse.json(
          { error: "المنطقة الزمنية غير صالحة، مثال: Asia/Riyadh" },
          { status: 400 }
        );
      }
    }

    if (normalizedValue === "") {
      // مسح صريح — حذف التجاوز والعودة لقيمة .env
      await prisma.setting.deleteMany({
        where: { workspaceId: ctx.workspaceId, key },
      });
    } else {
      const storedValue = isSecretIntegrationKey(key)
        ? encryptSecret(
            normalizedValue,
            integrationSecretContext(ctx.workspaceId, key)
          )
        : normalizedValue;
      await prisma.setting.upsert({
        where: { workspaceId_key: { workspaceId: ctx.workspaceId, key } },
        update: { value: storedValue },
        create: { workspaceId: ctx.workspaceId, key, value: storedValue },
      });
    }
  }

  // تدقيق: أي مزوّد لُمست حقوله (بوجود/عدم فقط — لا قيماً ولا أسراراً)
  const touched = new Set<string>();
  for (const key of Object.keys(body)) {
    if (key.startsWith("ULTRAMSG")) touched.add("ultramsg");
    else if (key.startsWith("OPENAI") || key.startsWith("AI_")) touched.add("openai");
    else if (key.startsWith("WHATSAPP") || key.startsWith("META")) touched.add("whatsapp");
    else if (key.startsWith("PUSHER")) touched.add("pusher");
    else touched.add("other");
  }
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "UPDATE",
    entity: "setting",
    meta: Object.fromEntries([...touched].map((p) => [p, true])),
  });

  const integrations = await getIntegrationList(ctx.workspaceId);
  return NextResponse.json({ integrations });
}
