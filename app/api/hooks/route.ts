import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// ويب هوك وارد: نظام خارجي يرسل حدثاً فيفتح محادثة واتساب ويشغّل الأتمتة
// التحقق من أن سير العمل المرتبط ينتمي لنفس مساحة العمل
async function validateWorkflowId(
  workspaceId: string,
  workflowId: unknown
): Promise<string | NextResponse> {
  if (workflowId === undefined || workflowId === null || workflowId === "") {
    return "";
  }
  if (typeof workflowId !== "string") {
    return NextResponse.json({ error: "سير العمل غير صالح" }, { status: 400 });
  }
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId },
    select: { id: true },
  });
  if (!workflow) {
    return NextResponse.json(
      { error: "سير العمل غير موجود في مساحة العمل" },
      { status: 400 }
    );
  }
  return workflowId;
}

// قائمة الويب هوك الوارد لمساحة العمل — للمالك فقط
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الويب هوك للمالك فقط" }, { status: 403 });
  }

  const webhooks = await prisma.inboundWebhook.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ webhooks });
}

// إنشاء ويب هوك وارد: الاسم مطلوب، وسير العمل اختياري ومن نفس المساحة
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الويب هوك للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "اسم الويب هوك مطلوب" }, { status: 400 });
  }
  const autoTag =
    typeof body?.autoTag === "string" ? body.autoTag.trim() : "";
  if (autoTag.length > 40) {
    return NextResponse.json(
      { error: "الوسم التلقائي حتى ٤٠ حرفاً" },
      { status: 400 }
    );
  }

  const workflowId = await validateWorkflowId(ctx.workspaceId, body?.workflowId);
  if (workflowId instanceof NextResponse) return workflowId;

  const webhook = await prisma.inboundWebhook.create({
    data: {
      workspaceId: ctx.workspaceId,
      name,
      token: randomBytes(24).toString("hex"),
      workflowId: workflowId || null,
      autoTag,
    },
  });
  return NextResponse.json({ webhook }, { status: 201 });
}
