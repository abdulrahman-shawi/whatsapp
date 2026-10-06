import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

// الرسائل المجدولة لمحادثة
// GET: القائمة (بانتظار الإرسال فقط) — POST: جدولة رسالة — DELETE ?id=: إلغاء
export async function GET(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  const items = await prisma.scheduledMessage.findMany({
    where: { conversationId: params.id, sentAt: null },
    orderBy: { sendAt: "asc" },
  });
  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      sendAt: i.sendAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  let body: { body?: string; sendAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const text = body.body?.trim();
  const sendAt = body.sendAt ? new Date(body.sendAt) : null;
  if (!text) return NextResponse.json({ error: "نص الرسالة مطلوب" }, { status: 400 });
  if (!sendAt || isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "موعد الإرسال يجب أن يكون في المستقبل" }, { status: 400 });
  }

  const item = await prisma.scheduledMessage.create({
    data: {
      workspaceId: ctx.workspaceId,
      conversationId: params.id,
      body: text,
      sendAt,
      createdById: ctx.userId,
    },
  });
  return NextResponse.json(
    {
      item: { ...item, sendAt: item.sendAt.toISOString() },
    },
    { status: 201 }
  );
}

export async function DELETE(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "المعرّف مطلوب" }, { status: 400 });
  await prisma.scheduledMessage.deleteMany({
    where: { id, conversationId: params.id, workspaceId: ctx.workspaceId, sentAt: null },
  });
  return NextResponse.json({ ok: true });
}
