import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// حذف مصدر معرفة — مع التحقق من تبعيته لمساحة عمل المستخدم
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const source = await prisma.knowledgeSource.findFirst({
    where: { id: params.id, agent: { workspaceId: ctx.workspaceId } },
    select: { id: true },
  });
  if (!source) {
    return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
  }

  await prisma.knowledgeSource.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
