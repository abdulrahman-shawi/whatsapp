import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const STATUSES = ["AI", "MANUAL", "HANDED_OFF"] as const;

// تحديث حالة المحادثة (آلي/يدوي/مسلّم) و/أو الأرشفة
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

  const data: { status?: (typeof STATUSES)[number]; isArchived?: boolean } = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.isArchived !== undefined) {
    if (typeof body.isArchived !== "boolean") {
      return NextResponse.json({ error: "قيمة الأرشفة غير صالحة" }, { status: 400 });
    }
    data.isArchived = body.isArchived;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
  }

  // التأكد أن المحادثة تتبع مساحة عمل المستخدم
  const existing = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  const conversation = await prisma.conversation.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ conversation });
}
