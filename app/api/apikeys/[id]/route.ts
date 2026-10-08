import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// إلغاء مفتاح API — ضمن مساحة العمل فقط، للمالك فقط
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json(
      { error: "إدارة مفاتيح API للمالك فقط" },
      { status: 403 }
    );
  }

  const existing = await prisma.apiKey.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "المفتاح غير موجود" }, { status: 404 });
  }
  if (existing.revokedAt) {
    return NextResponse.json({ error: "المفتاح ملغى مسبقاً" }, { status: 409 });
  }

  await prisma.apiKey.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
