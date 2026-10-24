import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { crawlWebsite, formatKnowledge } from "@/lib/web-knowledge";

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

// إعادة مزامنة مصدر موقع: زحف جديد للرابط وتحديث المحتوى المخزن
export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const source = await prisma.knowledgeSource.findFirst({
    where: { id: params.id, agent: { workspaceId: ctx.workspaceId } },
  });
  if (!source) {
    return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
  }
  if (source.type !== "WEBSITE" || !source.url) {
    return NextResponse.json(
      { error: "إعادة المزامنة متاحة لمصادر المواقع فقط" },
      { status: 400 }
    );
  }

  const crawled = await crawlWebsite(source.url);
  if (!crawled.ok) {
    return NextResponse.json({ error: crawled.error }, { status: 400 });
  }

  const updated = await prisma.knowledgeSource.update({
    where: { id: source.id },
    data: {
      content: formatKnowledge(crawled.pages),
      lastSyncedAt: new Date(),
    },
  });
  return NextResponse.json({
    source: updated,
    pages: crawled.pages.length,
    chars: crawled.chars,
  });
}
