import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseLeadFormBody } from "@/lib/lead-forms";
import { logAudit } from "@/lib/audit";

type Params = { params: { id: string } };

// تحديث نموذج: نفس تحقق الإنشاء على الحقول المُرسلة فقط
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "النماذج للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.leadForm.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "النموذج غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseLeadFormBody(body, true);
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const data: Prisma.LeadFormUpdateInput = {};
  if (parsed.name !== undefined) data.name = parsed.name;
  if (parsed.title !== undefined) data.title = parsed.title;
  if (parsed.description !== undefined) data.description = parsed.description;
  if (parsed.fields !== undefined) {
    data.fields = parsed.fields as Prisma.InputJsonValue;
  }
  if (parsed.autoTag !== undefined) data.autoTag = parsed.autoTag;
  if (parsed.autoStage !== undefined) data.autoStage = parsed.autoStage;
  if (parsed.isActive !== undefined) data.isActive = parsed.isActive;

  const form = await prisma.leadForm.update({
    where: { id: params.id },
    data,
  });
  // تدقيق التعديل: أسماء الحقول المتغيّرة وقيمة التفعيل إن وُجدت
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "UPDATE",
    entity: "form",
    entityId: params.id,
    meta: {
      name: existing.name,
      changed: Object.keys(data),
      isActive: parsed.isActive,
    },
  });
  return NextResponse.json({ form });
}

// حذف نموذج نهائياً — لا يؤثر على المحادثات الواردة منه سابقاً
export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "النماذج للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.leadForm.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "النموذج غير موجود" }, { status: 404 });
  }

  await prisma.leadForm.delete({ where: { id: params.id } });
  // تدقيق حذف النموذج
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "DELETE",
    entity: "form",
    entityId: params.id,
    meta: { name: existing.name },
  });
  return NextResponse.json({ ok: true });
}
