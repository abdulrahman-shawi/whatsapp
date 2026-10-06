import { NextResponse } from "next/server";
import type { ContactStage } from "@prisma/client";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isContactStage } from "@/lib/contact-stages";
import { triggerWorkflows } from "@/lib/workflows";

// تحديث بيانات جهة الاتصال: الاسم، الوسوم، الملاحظات
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const data: {
    name?: string | null;
    tags?: string[];
    notes?: string | null;
    stage?: ContactStage;
  } = {};
  if (body.name !== undefined) {
    if (body.name !== null && typeof body.name !== "string") {
      return NextResponse.json({ error: "الاسم غير صالح" }, { status: 400 });
    }
    data.name = body.name?.trim() || null;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((t: unknown) => typeof t === "string")) {
      return NextResponse.json({ error: "الوسوم غير صالحة" }, { status: 400 });
    }
    data.tags = body.tags.map((t: string) => t.trim()).filter(Boolean);
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "الملاحظات غير صالحة" }, { status: 400 });
    }
    data.notes = body.notes?.trim() || null;
  }
  if (body.stage !== undefined) {
    if (!isContactStage(body.stage)) {
      return NextResponse.json({ error: "الحالة غير صالحة" }, { status: 400 });
    }
    data.stage = body.stage;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
  }

  const existing = await prisma.contact.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "جهة الاتصال غير موجودة" }, { status: 404 });
  }

  const contact = await prisma.contact.update({
    where: { id: params.id },
    data,
    select: { id: true, name: true, waPhone: true, tags: true, notes: true, stage: true },
  });

  // محفّز سير العمل: تغيير حالة العميل في مسار البيع
  if (data.stage && existing.stage !== data.stage) {
    const conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id, isArchived: false, closedAt: null },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    });
    triggerWorkflows(
      ctx.workspaceId,
      "STAGE_CHANGE",
      { fromStage: existing.stage, toStage: data.stage },
      {
        workspaceId: ctx.workspaceId,
        contactId: contact.id,
        waPhone: contact.waPhone,
        contactName: contact.name,
        text: "",
        conversationId: conversation?.id,
      }
    ).catch(() => {});
  }

  return NextResponse.json({ contact });
}
