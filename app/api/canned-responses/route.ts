import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// الردود الجاهزة: اختصار + نص كامل — يكتب الموظف الاختصار فيخانة الإرسال فيتحول للنص
// GET: القائمة (أي عضو) — POST: إنشاء/تعديل (المالك) — DELETE ?id=: حذف (المالك)
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const items = await prisma.cannedResponse.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "إدارة الردود الجاهزة للمالك فقط" }, { status: 403 });
  }

  let body: { shortcut?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const shortcut = body.shortcut?.trim();
  const text = body.body?.trim();
  if (!shortcut || !text) {
    return NextResponse.json({ error: "الاختصار والنص مطلوبان" }, { status: 400 });
  }
  if (shortcut.length > 30) {
    return NextResponse.json({ error: "الاختصار طويل جداً (٣٠ حرفاً كحد أقصى)" }, { status: 400 });
  }

  // نفس الاختصار يُحدَّث بدل تكراره
  const item = await prisma.cannedResponse.upsert({
    where: { workspaceId_shortcut: { workspaceId: ctx.workspaceId, shortcut } },
    update: { body: text },
    create: { workspaceId: ctx.workspaceId, shortcut, body: text },
  });
  return NextResponse.json({ item }, { status: 201 });
}

export async function DELETE(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "إدارة الردود الجاهزة للمالك فقط" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "المعرّف مطلوب" }, { status: 400 });
  await prisma.cannedResponse.deleteMany({
    where: { id, workspaceId: ctx.workspaceId },
  });
  return NextResponse.json({ ok: true });
}
