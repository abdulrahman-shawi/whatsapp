import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWhatsAppCreds, sendWhatsAppMessage } from "@/lib/whatsapp";
import { triggerConversationUpdated, triggerNewMessage } from "@/lib/pusher";
import { isContactStage } from "@/lib/contact-stages";
import { recordStageChange } from "@/lib/stage-history";
import { recalculateLeadScore } from "@/lib/scoring";
import type { LeadFormField } from "@/lib/lead-forms";

// استقبال إرسالة نموذج عام — بلا مصادقة: تصل كمحادثة واردة في صندوق الوارد
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const form = await prisma.leadForm.findUnique({
    where: { id: params.id },
    include: { workspace: { select: { id: true } } },
  });
  if (!form || !form.isActive) {
    return NextResponse.json(
      { error: "هذا النموذج غير متاح حالياً" },
      { status: 404 }
    );
  }

  const fields = form.fields as unknown as LeadFormField[];
  const body = await req.json().catch(() => null);
  const rawValues: unknown = body?.values;
  if (!Array.isArray(rawValues)) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const values = fields.map((_, i) =>
    typeof rawValues[i] === "string" ? (rawValues[i] as string).trim() : ""
  );
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].required && !values[i]) {
      return NextResponse.json(
        { error: `الحقل "${fields[i].label}" مطلوب` },
        { status: 400 }
      );
    }
  }

  const phoneFieldIdx = fields.findIndex((f) => f.type === "phone");
  const phone = (values[phoneFieldIdx] ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (!phone) {
    return NextResponse.json(
      { error: "رقم الجوال غير صالح" },
      { status: 400 }
    );
  }

  // اسم جهة الاتصال من أول حقل نصي معنون "الاسم" إن وُجد
  const nameIdx = fields.findIndex(
    (f) =>
      f.type === "text" &&
      ["الاسم", "name", "Name", "NAME"].includes(f.label.trim())
  );
  const contactName = nameIdx >= 0 && values[nameIdx] ? values[nameIdx] : null;

  const bodyText = [
    `📝 نموذج: ${form.name}`,
    ...fields.map((f, i) => `${f.label}: ${values[i] || "—"}`),
  ].join("\n");

  const workspaceId = form.workspaceId;

  // دمج الوسم التلقائي مع وسوم جهة الاتصال الحالية (اتحاد بلا تكرار)
  const existing = await prisma.contact.findUnique({
    where: {
      workspaceId_waPhone: { workspaceId, waPhone: phone },
    },
    select: { id: true, name: true, tags: true },
  });
  const mergedTags =
    form.autoTag && !existing?.tags.includes(form.autoTag)
      ? [...(existing?.tags ?? []), form.autoTag]
      : (existing?.tags ?? []);

  const contact = await prisma.contact.upsert({
    where: {
      workspaceId_waPhone: { workspaceId, waPhone: phone },
    },
    create: {
      workspaceId,
      waPhone: phone,
      name: contactName,
      tags: form.autoTag ? [form.autoTag] : [],
      // المرحلة الافتراضية تُضبط عند الإنشاء فقط — لا نعيد تصنيف عميل قائم
      ...(form.autoStage && isContactStage(form.autoStage)
        ? { stage: form.autoStage }
        : {}),
    },
    update: {
      // لا نستبدل اسماً محفوظاً يدوياً — نملأ الفراغ فقط
      ...(contactName && !existing?.name ? { name: contactName } : {}),
      tags: mergedTags,
    },
  });

  // المرحلة التلقائية تُضبط عند الإنشاء فقط — ونُسجّلها في سجل المراحل
  if (form.autoStage && isContactStage(form.autoStage)) {
    await recordStageChange(contact.id, form.autoStage, "form");
  }
  void recalculateLeadScore(contact.id);

  const agent = await prisma.agent.findFirst({
    where: { workspaceId, isActive: true },
    select: { id: true, welcomeMessage: true },
  });

  // محادثة واردة مفتوحة لنفس جهة الاتصال إن وُجدت، وإلا محادثة جديدة
  let conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, platform: "WHATSAPP", isArchived: false },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        contactId: contact.id,
        agentId: agent?.id ?? null,
      },
    });
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      body: bodyText,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    // طلب جديد يعيد فتح المحادثة المغلقة ويحدّث موضعها في القائمة
    data: { lastMessageAt: new Date(), closedAt: null },
  });

  // رسالة الترحيب الفورية — أفضل جهد: عطل واتساب لا يفشل الإرسالة أبداً
  if (agent?.welcomeMessage) {
    try {
      const creds = await resolveWhatsAppCreds(workspaceId);
      const sent = await sendWhatsAppMessage(phone, agent.welcomeMessage, creds);
      if (sent) {
        const welcome = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: "OUTBOUND",
            senderType: "AI",
            body: agent.welcomeMessage,
          },
        });
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: welcome.createdAt },
        });
        try {
          triggerNewMessage(workspaceId, conversation.id, {
            ...welcome,
            createdAt: welcome.createdAt.toISOString(),
            senderName: null,
          });
        } catch {
          // البث الفوري تجميلي — الاستطلاع الدوري يغطي غيابه
        }
      }
    } catch {
      // فشل الترحيب لا يفشل استلام الطلب
    }
  }

  try {
    triggerNewMessage(workspaceId, conversation.id, {
      ...message,
      createdAt: message.createdAt.toISOString(),
      senderName: contactName,
    });
    triggerConversationUpdated(workspaceId, conversation.id);
  } catch {
    // البث الفوري تجميلي — الاستطلاع الدوري يغطي غيابه
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
