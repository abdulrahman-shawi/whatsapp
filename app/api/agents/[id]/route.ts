import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

// جلب وكيل مع مصادر معرفته
export async function GET(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    include: { knowledgeSources: { orderBy: { createdAt: "asc" } } },
  });
  if (!agent) {
    return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
  }
  return NextResponse.json({ agent });
}

// تحديث حقول الوكيل (كلها اختيارية)
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "الاسم غير صالح" }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if (body.systemPrompt !== undefined) {
    if (typeof body.systemPrompt !== "string" || !body.systemPrompt.trim()) {
      return NextResponse.json(
        { error: "تعليمات النظام غير صالحة" },
        { status: 400 }
      );
    }
    data.systemPrompt = body.systemPrompt.trim();
  }
  if (body.welcomeMessage !== undefined) {
    if (typeof body.welcomeMessage !== "string") {
      return NextResponse.json({ error: "رسالة الترحيب غير صالحة" }, { status: 400 });
    }
    data.welcomeMessage = body.welcomeMessage;
  }
  if (body.responseDelaySec !== undefined) {
    if (!Number.isInteger(body.responseDelaySec) || body.responseDelaySec < 0) {
      return NextResponse.json({ error: "وقت الانتظار غير صالح" }, { status: 400 });
    }
    data.responseDelaySec = body.responseDelaySec;
  }
  if (body.handoffKeywords !== undefined) {
    if (
      !Array.isArray(body.handoffKeywords) ||
      !body.handoffKeywords.every((k: unknown) => typeof k === "string")
    ) {
      return NextResponse.json({ error: "كلمات التسليم غير صالحة" }, { status: 400 });
    }
    data.handoffKeywords = body.handoffKeywords;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "قيمة التفعيل غير صالحة" }, { status: 400 });
    }
    data.isActive = body.isActive;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
  }

  const existing = await prisma.agent.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
  }

  const agent = await prisma.agent.update({ where: { id: params.id }, data });
  return NextResponse.json({ agent });
}

// حذف الوكيل — مصادر المعرفة تُحذف تلقائياً والمحادثات تبقى (agentId = null)
export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const existing = await prisma.agent.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
  }

  await prisma.agent.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
