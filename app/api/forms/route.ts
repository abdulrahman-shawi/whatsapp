import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseLeadFormBody } from "@/lib/lead-forms";

// نماذج استقبال العملاء لمساحة العمل — الأحدث أولاً
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "النماذج للمالك فقط" }, { status: 403 });
  }

  const forms = await prisma.leadForm.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ forms });
}

// إنشاء نموذج جديد: حقول مُتحقق منها مع اشتراط حقل جوال مطلوب واحد على الأقل
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "النماذج للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseLeadFormBody(body, false);
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const data: Prisma.LeadFormCreateInput = {
    workspace: { connect: { id: ctx.workspaceId } },
    name: parsed.name!,
    title: parsed.title ?? "تواصل معنا",
    fields: (parsed.fields ?? []) as Prisma.InputJsonValue,
    autoTag: parsed.autoTag ?? "",
  };
  if (parsed.description !== undefined) data.description = parsed.description;
  if (parsed.autoStage !== undefined) data.autoStage = parsed.autoStage;
  if (parsed.isActive !== undefined) data.isActive = parsed.isActive;

  const form = await prisma.leadForm.create({ data });
  return NextResponse.json({ form }, { status: 201 });
}
