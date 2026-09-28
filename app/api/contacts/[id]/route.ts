import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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

  const data: { name?: string | null; tags?: string[]; notes?: string | null } = {};
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
    select: { id: true, name: true, waPhone: true, tags: true, notes: true },
  });
  return NextResponse.json({ contact });
}
