import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  THEME_KEY,
  DEFAULT_THEME_COLOR,
  isValidHexColor,
  getWorkspaceThemeColor,
} from "@/lib/theme";

// لون العلامة لمساحة العمل: لون أساسي واحد يُطبَّق على لوحة التحكم كلها
// يُخزَّن في إعدادات مساحة العمل بمفتاح ثابت "theme" وقيمته hex صالح
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const color = await getWorkspaceThemeColor(ctx.workspaceId);
  return NextResponse.json({ color });
}

export async function PUT(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { color } = body ?? {};

  if (typeof color !== "string" || !isValidHexColor(color)) {
    return NextResponse.json({ error: "اللون غير صالح" }, { status: 400 });
  }

  const value = color.trim().toLowerCase();
  // القيمة الافتراضية تعني إزالة التخصيص والعودة للون الافتراضي
  if (value === DEFAULT_THEME_COLOR) {
    await prisma.setting.deleteMany({
      where: { workspaceId: ctx.workspaceId, key: THEME_KEY },
    });
  } else {
    await prisma.setting.upsert({
      where: { workspaceId_key: { workspaceId: ctx.workspaceId, key: THEME_KEY } },
      create: { workspaceId: ctx.workspaceId, key: THEME_KEY, value },
      update: { value },
    });
  }

  // تدقيق تحديث لون العلامة
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "UPDATE",
    entity: "setting",
    entityId: THEME_KEY,
    meta: { color: value },
  });

  return NextResponse.json({ ok: true, color: value });
}
