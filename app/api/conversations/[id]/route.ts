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
    closedAt?: Date | null;
    csatPending?: boolean;
    csatAskedAt?: Date;
    tags?: string[];
    notes?: string | null;
  } = {};
  // مصفوفة المسند إليهم الجديدة — تُعالج بعد تحديث المحادثة في معاملة مستقلة
  let assigneeIds: string[] | null = null;
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
  if (body.assignedToIds !== undefined) {
    // مصفوفة فارغة تعني إلغاء الإسناد كله؛ وكل معرف يجب أن يكون عضواً في مساحة العمل
    if (!Array.isArray(body.assignedToIds)) {
      return NextResponse.json({ error: "قائمة الإسناد غير صالحة" }, { status: 400 });
    }
    const rawIds: unknown[] = body.assignedToIds;
    if (rawIds.some((id) => typeof id !== "string" || !id)) {
      return NextResponse.json({ error: "معرف مسند غير صالح" }, { status: 400 });
    }
    const ids = [...new Set(rawIds as string[])];
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: { in: ids }, workspaceId: ctx.workspaceId },
    });
    if (memberships.length !== ids.length) {
      return NextResponse.json(
        { error: "أحد المستخدمين ليس عضواً في مساحة العمل" },
        { status: 400 }
      );
    }
    assigneeIds = ids;
  }
  if (body.closed !== undefined) {
    if (typeof body.closed !== "boolean") {
      return NextResponse.json({ error: "قيمة الإغلاق غير صالحة" }, { status: 400 });
    }
    data.closedAt = body.closed ? new Date() : null;
    // سؤال تقييم الرضا: يُجدوَل بعد الإغلاق ويُلغى انتظار التقييم عند إعادة الفتح
    data.csatPending = body.closed;
    if (body.closed) data.csatAskedAt = new Date();
  }
  // وسوم وملاحظات على مستوى المحادثة (مستقلة عن جهة الاتصال)
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || (body.tags as unknown[]).some((t) => typeof t !== "string" || (t as string).length > 40)) {
      return NextResponse.json({ error: "قائمة الوسوم غير صالحة (٤٠ حرفاً كحد أقصى للوسم)" }, { status: 400 });
    }
    data.tags = [...new Set((body.tags as string[]).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "الملاحظة غير صالحة" }, { status: 400 });
    }
    data.notes = body.notes?.trim() ? body.notes.trim() : null;
  }
  if (Object.keys(data).length === 0 && assigneeIds === null) {
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

  // سؤال تقييم الرضا: إذا أُغلقت المحادثة الآن (لم تكن مغلقة) نجدوَل سؤال التقييم
  // ليُرسل بعد دقيقتين عبر الكرون — ونتجنّب التكرار إن كان انتظار التقييم مفعّلاً
  if (body.closed === true && !existing.closedAt && !existing.csatPending) {
    await prisma.scheduledMessage.create({
      data: {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        body: "شكراً لتواصلك معنا 🌟\nكيف كانت تجربتك؟ قيّم خدمتنا بالرد برقم من ١ إلى ٥",
        sendAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    });
  }

  // استبدال الإسنادات بالقائمة الجديدة (إن وُجدت) — حذف ثم إنشاء ذريّان
  if (assigneeIds !== null) {
    await prisma.$transaction([
      prisma.conversationAssignee.deleteMany({
        where: { conversationId: params.id },
      }),
      ...(assigneeIds.length > 0
        ? [
            prisma.conversationAssignee.createMany({
              data: assigneeIds.map((userId) => ({
                conversationId: params.id,
                userId,
              })),
            }),
          ]
        : []),
    ]);
  }

  // إشعار باقي الفريق فوراً بتحديث المحادثة (إسناد/إغلاق/...) — أفضل-جهد
  triggerConversationUpdated(ctx.workspaceId, params.id);

  return NextResponse.json({ conversation });
}
