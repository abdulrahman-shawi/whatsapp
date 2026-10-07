import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleIncomingWhatsAppMessage } from "@/lib/agent-engine";
import { triggerWorkflows, type TriggerConfig } from "@/lib/workflows";

// محفزات يمكن إطلاقها مباشرة عبر triggerWorkflows — NO_REPLY يفحصه الكرون فقط
const DIRECT_TRIGGERS = ["KEYWORD", "FROM_NUMBERS", "NEW_CONTACT", "STAGE_CHANGE"] as const;
type DirectTrigger = (typeof DIRECT_TRIGGERS)[number];

// المستقبل العام: POST /api/hooks/<token> — بلا مصادقة، الرمز نفسه هو المفتاح
// نظام خارجي (متجر، نموذج طلبات) يرسل حدثاً فيفتح محادثة واتساب ويشغّل الأتمتة
export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const webhook = await prisma.inboundWebhook.findUnique({
      where: { token: params.token },
    });
    // رمز غير معروف أو ويب هوك موقوف — نتصرف كأن المسار غير موجود
    if (!webhook || !webhook.isActive) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    // تحديث وقت آخر استدعاء — أفضل جهد بلا انتظار (fire-and-forget)
    prisma.inboundWebhook
      .update({ where: { id: webhook.id }, data: { lastHitAt: new Date() } })
      .catch(() => {});

    const body: unknown = await req.json().catch(() => null);
    const record = (body ?? {}) as Record<string, unknown>;

    // الرقم: الشكل الصريح phone ثم أسماء شائعة بديلة — أرقام فقط بلا صفرين افتتاحيين
    const rawPhone = record.phone ?? record.customerPhone ?? record.mobile;
    const phone =
      typeof rawPhone === "string" || typeof rawPhone === "number"
        ? String(rawPhone).replace(/\D/g, "").replace(/^00/, "")
        : "";
    if (!phone) {
      // لا نعطّل مرسل الحدث — نسجّل ونرد نجاحاً ولا نخزن شيئاً
      console.warn(
        `[hooks] ويب هوك "${webhook.name}" (${webhook.id}) وصل بدون رقم هاتف — يُتجاهل`
      );
      return NextResponse.json({ ok: false, reason: "no_phone" });
    }

    const contactName =
      typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : null;
    const rawMessage = record.message ?? record.text ?? record.note ?? record.orderId;
    const message =
      rawMessage === undefined || rawMessage === null ? "" : String(rawMessage);
    const bodyTag = typeof record.tag === "string" ? record.tag.trim() : "";

    // بادئة المصدر دائماً واضحة حتى يعرف الفريق من أين جاء الحدث
    const text = message ? `🛒 ${webhook.name}: ${message}` : `🛒 ${webhook.name}`;

    // أ) فتح المحادثة عبر خط المعالجة الكامل: جهة اتصال + محادثة + رسالة
    // + رد الوكيل الآلي + محفزات الكلمات المفتاحية — ينشئ جهة الاتصال بنفسه
    await handleIncomingWhatsAppMessage({
      waPhone: phone,
      contactName,
      text,
      workspaceId: webhook.workspaceId,
    });

    // دمج الوسم التلقائي للويب هوك مع وسم الحدث في وسوم جهة الاتصال (اتحاد بلا تكرار)
    const contact = await prisma.contact.findUnique({
      where: {
        workspaceId_waPhone: {
          workspaceId: webhook.workspaceId,
          waPhone: phone,
        },
      },
      select: { id: true, tags: true },
    });
    if (contact) {
      const merged = [...contact.tags];
      let changed = false;
      for (const tag of [webhook.autoTag, bodyTag]) {
        const t = tag.trim();
        if (t && !merged.includes(t)) {
          merged.push(t);
          changed = true;
        }
      }
      if (changed) {
        await prisma.contact
          .update({ where: { id: contact.id }, data: { tags: merged } })
          .catch(() => {});
      }

      // ب) تشغيل سير العمل المرتبط — بمحفزه الخاص وإعداداته المخزنة
      if (webhook.workflowId) {
        const workflow = await prisma.workflow.findFirst({
          where: { id: webhook.workflowId, workspaceId: webhook.workspaceId },
        });
        if (workflow && (DIRECT_TRIGGERS as readonly string[]).includes(workflow.trigger)) {
          const conversation = await prisma.conversation.findFirst({
            where: {
              contactId: contact.id,
              platform: "WHATSAPP",
              isArchived: false,
            },
            orderBy: { lastMessageAt: "desc" },
            select: { id: true },
          });
          const config = (
            workflow.trigger === "NEW_CONTACT"
              ? {}
              : ((workflow.triggerConfig ?? {}) as TriggerConfig)
          ) as TriggerConfig;
          try {
            await triggerWorkflows(
              webhook.workspaceId,
              workflow.trigger as DirectTrigger,
              config,
              {
                workspaceId: webhook.workspaceId,
                contactId: contact.id,
                waPhone: phone,
                contactName,
                text,
                conversationId: conversation?.id,
                vars: {},
              }
            );
          } catch (e) {
            // فشل سير العمل لا يفشل استلام الحدث
            console.error(`[hooks] فشل تشغيل سير العمل "${workflow.name}":`, e);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // لا نُفشل الطلب أبداً — المرسل الخارجي قد يعيد الإرسال عند الأخطاء
    console.error("[hooks] خطأ في معالجة الحدث الوارد:", e);
    return NextResponse.json({ ok: true });
  }
}

// تعديل ويب هوك وارد: الاسم/سير العمل/الوسم التلقائي/التفعيل — للمالك فقط
// المسار الديناميكي هنا [token] لكن PATCH/DELETE يعاملونه كمعرّف (id) —
// Next.js يرفض مقطعين ديناميكيين باسمين مختلفين في نفس المستوى
export async function PATCH(
  req: Request,
  { params }: { params: { token: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الويب هوك للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.inboundWebhook.findFirst({
    where: { id: params.token, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الويب هوك غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const data: {
    name?: string;
    workflowId?: string | null;
    autoTag?: string;
    isActive?: boolean;
  } = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "اسم الويب هوك مطلوب" }, { status: 400 });
    }
    data.name = name;
  }

  if (body?.autoTag !== undefined) {
    const autoTag = typeof body.autoTag === "string" ? body.autoTag.trim() : "";
    if (autoTag.length > 40) {
      return NextResponse.json(
        { error: "الوسم التلقائي حتى ٤٠ حرفاً" },
        { status: 400 }
      );
    }
    data.autoTag = autoTag;
  }

  if (body?.workflowId !== undefined) {
    if (body.workflowId === null || body.workflowId === "") {
      data.workflowId = null;
    } else if (typeof body.workflowId === "string") {
      const workflow = await prisma.workflow.findFirst({
        where: { id: body.workflowId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!workflow) {
        return NextResponse.json(
          { error: "سير العمل غير موجود في مساحة العمل" },
          { status: 400 }
        );
      }
      data.workflowId = body.workflowId;
    } else {
      return NextResponse.json({ error: "سير العمل غير صالح" }, { status: 400 });
    }
  }

  if (body?.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "الحالة غير صالحة" }, { status: 400 });
    }
    data.isActive = body.isActive;
  }

  const webhook = await prisma.inboundWebhook.update({
    where: { id: existing.id },
    data,
  });
  return NextResponse.json({ webhook });
}

// حذف ويب هوك وارد — للمالك فقط وضمن مساحة العمل
export async function DELETE(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الويب هوك للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.inboundWebhook.findFirst({
    where: { id: params.token, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الويب هوك غير موجود" }, { status: 404 });
  }

  await prisma.inboundWebhook.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
