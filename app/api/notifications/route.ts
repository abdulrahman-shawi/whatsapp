import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// إشعارات المتابعات الداخلية: محادثات حان موعد متابعتها ولم تُغلق
// يستطلعها جرس التنبيه في اللوحة كل دقيقة — بدون Pusher لتبسيط النشر
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const now = new Date();
  const due = await prisma.conversation.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      isArchived: false,
      closedAt: null,
      followUpAt: { lte: now },
    },
    orderBy: { followUpAt: "asc" },
    take: 20,
    include: {
      contact: { select: { name: true, waPhone: true } },
      assignees: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    items: due.map((c) => ({
      id: c.id,
      contactName: c.contact.name ?? c.contact.waPhone,
      followUpAt: c.followUpAt!.toISOString(),
      assignees: c.assignees.map((a) => a.user),
    })),
  });
}
