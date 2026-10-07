import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStaffRestrictionFilter } from "@/lib/conversations";

// بحث شامل في الوارد: اسم العميل، رقمه، الوسوم، ونصوص الرسائل
// GET ?q=كلمة — يعيد المحادثات المطابقة مرتبة بأحدث رسالة
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ conversations: [] });
  }

  const restrictToUserId = await getStaffRestrictionFilter(
    ctx.workspaceId,
    ctx.role,
    ctx.userId
  );

  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      // الموظف المقيد يرى نتائج بحث من محادثاته المسندة إليه فقط
      ...(restrictToUserId
        ? { assignees: { some: { userId: restrictToUserId } } }
        : {}),
      OR: [
        { contact: { name: { contains: q, mode: "insensitive" } } },
        { contact: { waPhone: { contains: q } } },
        { contact: { tags: { has: q } } },
        { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
      ],
    },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
    take: 30,
    include: {
      contact: {
        select: { id: true, name: true, waPhone: true, tags: true, stage: true },
      },
      assignees: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { assignedAt: "asc" },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: { messages: { where: { direction: "INBOUND", isRead: false } } },
      },
    },
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      status: c.status,
      platform: c.platform,
      isArchived: c.isArchived,
      closedAt: c.closedAt ? c.closedAt.toISOString() : null,
      followUpAt: c.followUpAt ? c.followUpAt.toISOString() : null,
      tags: c.tags,
      notes: c.notes,
      sentiment: c.sentiment,
      summary: c.summary,
      lastMessageAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
      assignees: c.assignees.map((a) => a.user),
      contact: c.contact,
      lastMessage: c.messages[0]
        ? {
            body: c.messages[0].body,
            direction: c.messages[0].direction,
            createdAt: c.messages[0].createdAt.toISOString(),
          }
        : null,
      unreadCount: c._count.messages,
    })),
  });
}
