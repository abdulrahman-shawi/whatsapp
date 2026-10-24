import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { validateSteps, type WorkflowStep } from "@/lib/workflows";
import { logAudit } from "@/lib/audit";
import { WORKFLOW_TRIGGERS } from "@/components/workflows/workflow-io";

type Params = { params: { id: string } };

// تفاصيل سير العمل + آخر ٢٠ تشغيلاً
export async function GET(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const workflow = await prisma.workflow.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    include: {
      createdBy: { select: { name: true } },
      runs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!workflow) {
    return NextResponse.json({ error: "سير العمل غير موجود" }, { status: 404 });
  }
  return NextResponse.json({ workflow });
}

// تعديل (تفعيل/إيقاف أو محتوى كامل) — المالك فقط
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.workflow.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "سير العمل غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "قيمة التفعيل غير صالحة" }, { status: 400 });
    }
    data.isActive = body.isActive;
  }
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "الاسم غير صالح" }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if (body.trigger !== undefined || body.triggerConfig !== undefined) {
    const trigger = body.trigger ?? existing.trigger;
    if (typeof trigger !== "string" || !(WORKFLOW_TRIGGERS as readonly string[]).includes(trigger)) {
      return NextResponse.json({ error: "محفّز غير صالح" }, { status: 400 });
    }
    const tc = body.triggerConfig ?? existing.triggerConfig ?? {};
    if (!tc || typeof tc !== "object" || Array.isArray(tc)) {
      return NextResponse.json({ error: "إعدادات المحفّز غير صالحة" }, { status: 400 });
    }
    const triggerConfig: Record<string, unknown> = {};
    if (trigger === "KEYWORD") {
      const keywords = Array.isArray(tc.keywords)
        ? tc.keywords.filter((k: unknown) => typeof k === "string" && k.trim())
        : [];
      if (!keywords.length) {
        return NextResponse.json({ error: "أضف كلمة مفتاحية واحدة على الأقل" }, { status: 400 });
      }
      triggerConfig.keywords = keywords.map((k: string) => k.trim());
    }
    if (trigger === "FROM_NUMBERS") {
      const phones = Array.isArray(tc.phones)
        ? tc.phones.filter((p: unknown) => typeof p === "string" && p.trim())
        : [];
      if (!phones.length) {
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
        return NextResponse.json({ error: "مدة الصمت بين ساعة واحدة و٧٢٠ ساعة (٣٠ يوماً)" }, { status: 400 });
      }
      triggerConfig.hours = Math.round(hours);
    }
    if (trigger === "CONTACT_FIELD_UPDATED") {
      if (!["name", "email", "notes"].includes(String(tc.field))) {
        return NextResponse.json({ error: "اختر الحقل الذي سيؤدي تحديثه إلى تشغيل سير العمل" }, { status: 400 });
      }
      triggerConfig.field = tc.field;
    }
    if (trigger === "CONTACT_TAG_UPDATED" && typeof tc.tag === "string" && tc.tag.trim()) {
      triggerConfig.tag = tc.tag.trim();
    }
    if (tc.oncePerContact === true) triggerConfig.oncePerContact = true;
    data.trigger = trigger;
    data.triggerConfig = triggerConfig;
  }
  if (body.steps !== undefined) {
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return NextResponse.json({ error: "الخطوات غير صالحة" }, { status: 400 });
    }
    // التحقق من بنية الخطوات (شاملة فروع IF) مقابل أعضاء الفريق
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { userId: true },
    });
    const stepErrors = validateSteps(
      body.steps as WorkflowStep[],
      members.map((m) => m.userId)
    );
    if (stepErrors.length > 0) {
      return NextResponse.json({ error: stepErrors.join(" — ") }, { status: 400 });
    }
    data.steps = body.steps;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
  }

  const workflow = await prisma.workflow.update({
    where: { id: params.id },
    data,
  });
  // تدقيق تعديل سير العمل (تفعيل/إيقاف أو محتوى)
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "UPDATE",
    entity: "workflow",
    entityId: params.id,
    meta: { name: workflow.name, changed: Object.keys(data) },
  });
  return NextResponse.json({ workflow });
}

// حذف سير العمل — المالك فقط
export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.workflow.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "سير العمل غير موجود" }, { status: 404 });
  }

  await prisma.workflow.delete({ where: { id: params.id } });
  // تدقيق حذف سير العمل
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "DELETE",
    entity: "workflow",
    entityId: params.id,
    meta: { name: existing.name },
  });
  return NextResponse.json({ ok: true });
}
