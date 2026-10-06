import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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
  if (body.triggerConfig !== undefined) data.triggerConfig = body.triggerConfig;
  if (body.steps !== undefined) {
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return NextResponse.json({ error: "الخطوات غير صالحة" }, { status: 400 });
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
  return NextResponse.json({ ok: true });
}
