import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getIntegrationList, isIntegrationKey } from "@/lib/settings";

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

    if (value.trim() === "") {
      // مسح صريح — حذف التجاوز والعودة لقيمة .env
      await prisma.setting.deleteMany({
        where: { workspaceId: ctx.workspaceId, key },
      });
    } else {
      await prisma.setting.upsert({
        where: { workspaceId_key: { workspaceId: ctx.workspaceId, key } },
        update: { value: value.trim() },
        create: { workspaceId: ctx.workspaceId, key, value: value.trim() },
      });
    }
  }

  const integrations = await getIntegrationList(ctx.workspaceId);
  return NextResponse.json({ integrations });
}
