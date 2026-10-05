import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// قائمة قوالب رسائل واتساب لمساحة العمل
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const templates = await prisma.template.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ templates });
}

// إضافة قالب جديد — الاسم يجب أن يطابق قالباً معتمداً في ميتا
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const language = body?.language?.trim() || "ar";
  const bodyText = body?.body?.trim();
  if (!name || !bodyText) {
    return NextResponse.json(
      { error: "اسم القالب ونص المعاينة مطلوبان" },
      { status: 400 }
    );
  }

  const template = await prisma.template.create({
    data: {
      workspaceId: ctx.workspaceId,
      name,
      language,
      body: bodyText,
    },
  });
  return NextResponse.json({ template }, { status: 201 });
}
