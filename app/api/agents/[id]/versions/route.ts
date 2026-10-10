import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// سجل إصدارات الوكيل — الأحدث أولاً، مع اسم من أنشأ كل إصدار
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!agent) return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });

  const versions = await prisma.agentVersion.findMany({
    where: { agentId: params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // أسماء منشئي الإصدارات — دمج بسيط بلا علاقة مخططية
  const creatorIds = [...new Set(versions.map((v) => v.createdById).filter(Boolean))] as string[];
  const creators = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, name: true },
  });
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]));
  return NextResponse.json({
    versions: versions.map((v) => ({
      id: v.id,
      name: v.name,
      createdAt: v.createdAt.toISOString(),
      createdByName: v.createdById ? (creatorNameById.get(v.createdById) ?? null) : null,
    })),
  });
}
