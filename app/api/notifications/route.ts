import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// GET: (١) إشعارات المتابعات الداخلية — يستطلعها جرس التنبيه في اللوحة كل دقيقة
//      (٢) آخر ٣٠ إشعاراً داخلياً للمستخدم (له أو للفريق) + عدّاد غير المقروء — جرس الإشعارات
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const now = new Date();
  const [due, notifications, unread] = await Promise.all([
    prisma.conversation.findMany({
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
    }),
    prisma.notification.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [{ userId: ctx.userId }, { userId: null }],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({
      where: {
        workspaceId: ctx.workspaceId,
        readAt: null,
        OR: [{ userId: ctx.userId }, { userId: null }],
      },
    }),
  ]);

  return NextResponse.json({
    items: due.map((c) => ({
      id: c.id,
      contactName: c.contact.name ?? c.contact.waPhone,
      followUpAt: c.followUpAt!.toISOString(),
      assignees: c.assignees.map((a) => a.user),
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount: unread,
  });
}

// PATCH: تحديد إشعار واحد كمقروء {id} أو الكل {all:true}
export async function PATCH(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    all?: boolean;
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  // نطاق الإشعارات التي يملك المستخدم تعليمها: له هو أو للفريق كله، في مساحة عمله
  const scope = {
    workspaceId: ctx.workspaceId,
    OR: [{ userId: ctx.userId }, { userId: null }],
  };

  if (body.all === true) {
    await prisma.notification.updateMany({
      where: { ...scope, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (typeof body.id === "string" && body.id) {
    await prisma.notification.updateMany({
      where: { ...scope, id: body.id },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
}
