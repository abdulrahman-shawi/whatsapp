import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { validateSteps, type WorkflowStep } from "@/lib/workflows";

const TRIGGERS = [
  "KEYWORD",
  "FROM_NUMBERS",
  "NEW_CONTACT",
  "STAGE_CHANGE",
  "NO_REPLY",
] as const;

// قائمة سير العمل لمساحة العمل
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const workflows = await prisma.workflow.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { runs: true } },
    },
  });
  return NextResponse.json({ workflows });
}

// إنشاء سير عمل جديد — المالك فقط
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const trigger = body.trigger as (typeof TRIGGERS)[number];
  const steps = (Array.isArray(body.steps) ? body.steps : []) as WorkflowStep[];
  if (!name) return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
  if (!TRIGGERS.includes(trigger)) {
    return NextResponse.json({ error: "محفّز غير صالح" }, { status: 400 });
  }

  // التحقق من إعدادات المحفّز
  const tc = body.triggerConfig ?? {};
  const triggerConfig: Record<string, unknown> = {};
  if (trigger === "KEYWORD") {
    const keywords = Array.isArray(tc.keywords)
      ? tc.keywords.filter((k: unknown) => typeof k === "string" && k.trim())
      : [];
    if (keywords.length === 0) {
      return NextResponse.json({ error: "أضف كلمة مفتاحية واحدة على الأقل" }, { status: 400 });
    }
    triggerConfig.keywords = keywords.map((k: string) => k.trim());
  }
  if (trigger === "FROM_NUMBERS") {
    const phones = Array.isArray(tc.phones)
      ? tc.phones.filter((p: unknown) => typeof p === "string" && p.trim())
      : [];
    if (phones.length === 0) {
      return NextResponse.json({ error: "أضف رقماً واحداً على الأقل" }, { status: 400 });
    }
    triggerConfig.phones = phones.map((p: string) => p.trim());
  }
  if (trigger === "STAGE_CHANGE") {
    if (typeof tc.toStage !== "string" || !tc.toStage) {
      return NextResponse.json({ error: "الحالة الجديدة مطلوبة" }, { status: 400 });
    }
    triggerConfig.toStage = tc.toStage;
    if (typeof tc.fromStage === "string" && tc.fromStage) {
      triggerConfig.fromStage = tc.fromStage;
    }
  }
  if (trigger === "NO_REPLY") {
    const hours = Number(tc.hours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) {
      return NextResponse.json(
        { error: "مدة الصمت بين ساعة واحدة و٧٢٠ ساعة (٣٠ يوماً)" },
        { status: 400 }
      );
    }
    triggerConfig.hours = Math.round(hours);
  }

  // التحقق من الخطوات مقابل أعضاء الفريق الفعليين
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { userId: true },
  });
  const stepErrors = validateSteps(steps, members.map((m) => m.userId));
  if (stepErrors.length > 0) {
    return NextResponse.json({ error: stepErrors.join(" — ") }, { status: 400 });
  }

  const workflow = await prisma.workflow.create({
    data: {
      workspaceId: ctx.workspaceId,
      name,
      trigger,
      triggerConfig: triggerConfig as Prisma.InputJsonValue,
      steps: steps as Prisma.InputJsonValue,
      createdById: ctx.userId,
    },
  });
  return NextResponse.json({ workflow }, { status: 201 });
}
