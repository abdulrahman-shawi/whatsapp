import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { executeTriggeredWorkflow } from "@/lib/workflows";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التشغيل اليدوي للمالك فقط" }, { status: 403 });
  }

  const workflow = await prisma.workflow.findFirst({
    where: {
      id: params.id,
      workspaceId: ctx.workspaceId,
      isActive: true,
      trigger: "SHORTCUT",
    },
  });
  if (!workflow) {
    return NextResponse.json({ error: "الاختصار غير موجود أو غير مفعّل" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const rawPhone = body && typeof body === "object" ? body.phone : null;
  const phone =
    typeof rawPhone === "string"
      ? rawPhone.replace(/\D/g, "").replace(/^00/, "")
      : "";
  if (!phone) {
    return NextResponse.json({ error: "أدخل رقم هاتف صالحاً" }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({
    where: { workspaceId: ctx.workspaceId, waPhone: phone },
  });
  if (!contact) {
    return NextResponse.json({ error: "جهة الاتصال غير موجودة في مساحة العمل" }, { status: 404 });
  }
  const conversation = await prisma.conversation.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      closedAt: null,
      isArchived: false,
    },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conversation) {
    return NextResponse.json(
      { error: "يحتاج الاختصار إلى محادثة مفتوحة مع جهة الاتصال" },
      { status: 400 }
    );
  }

  const status = await executeTriggeredWorkflow(workflow, {
    workspaceId: ctx.workspaceId,
    contactId: contact.id,
    waPhone: contact.waPhone,
    contactName: contact.name,
    text: "",
    conversationId: conversation.id,
    stage: contact.stage,
    tags: contact.tags,
    vars: {},
  });
  if (status === "SKIPPED") {
    return NextResponse.json(
      { error: "تم تشغيل هذا الاختصار من قبل لهذه الجهة" },
      { status: 409 }
    );
  }
  if (status === "FAILED") {
    return NextResponse.json(
      { error: "فشل تنفيذ خطوة أو أكثر؛ راجع سجل تشغيل سير العمل" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, status });
}
