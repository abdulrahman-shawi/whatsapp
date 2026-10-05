import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { triggerConversationUpdated } from "@/lib/pusher";

const STATUSES = ["AI", "MANUAL", "HANDED_OFF"] as const;

// تحديث حالة المحادثة (آلي/يدوي/مسلّم) و/أو الأرشفة و/أو الإسناد و/أو الإغلاق
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

  const data: {
    status?: (typeof STATUSES)[number];
    isArchived?: boolean;
    assignedToId?: string | null;
    closedAt?: Date | null;
  } = {};
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
  if (body.assignedToId !== undefined) {
    // null لإلغاء الإسناد، وإلا يجب أن يكون العضو عضواً فعلياً في مساحة العمل
    if (body.assignedToId !== null) {
      if (typeof body.assignedToId !== "string") {
        return NextResponse.json({ error: "مسند غير صالح" }, { status: 400 });
      }
      const membership = await prisma.workspaceMember.findFirst({
        where: { userId: body.assignedToId, workspaceId: ctx.workspaceId },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "المستخدم ليس عضواً في مساحة العمل" },
          { status: 400 }
        );
      }
      data.assignedToId = body.assignedToId;
    } else {
      data.assignedToId = null;
    }
  }
  if (body.closed !== undefined) {
    if (typeof body.closed !== "boolean") {
      return NextResponse.json({ error: "قيمة الإغلاق غير صالحة" }, { status: 400 });
    }
    data.closedAt = body.closed ? new Date() : null;
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

  // إشعار باقي الفريق فوراً بتحديث المحادثة (إسناد/إغلاق/...) — أفضل-جهد
  triggerConversationUpdated(ctx.workspaceId, params.id);

  return NextResponse.json({ conversation });
}
