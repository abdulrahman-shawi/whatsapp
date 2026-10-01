import type { Agent, KnowledgeSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateReply, type ChatMessage } from "@/lib/openai";
import { resolveWhatsAppCreds, sendWhatsAppMessage } from "@/lib/whatsapp";
import { retrieveRelevantKnowledge } from "@/lib/retrieval";
import { triggerNewMessage, triggerConversationUpdated } from "@/lib/pusher";
import { getIntegration } from "@/lib/settings";

type AgentWithKnowledge = Agent & { knowledgeSources: KnowledgeSource[] };

// مفتاح الشهر الحالي لسجل الاستهلاك، مثل "2025-01"
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// زيادة عدّاد الرسائل الشهري لمساحة العمل
async function incrementUsage(workspaceId: string) {
  const month = currentMonth();
  await prisma.usageRecord.upsert({
    where: { workspaceId_month: { workspaceId, month } },
    update: { messagesUsed: { increment: 1 } },
    create: { workspaceId, month, messagesUsed: 1 },
  });
}

// تطبيع بسيط آمن للعربية قبل المطابقة الجزئية
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

type PipelineOptions = {
  workspaceId: string;
  agent: AgentWithKnowledge;
  waPhone: string;
  contactName: string | null;
  text: string;
  platform: "WHATSAPP" | "WIDGET";
  conversationId?: string;
  sendReply: (to: string, body: string) => Promise<unknown>;
};

// خط معالجة الرسالة الواردة المشترك بين واتساب والويدجت
async function runPipeline(
  opts: PipelineOptions
): Promise<{
  conversationId: string;
  reply: string | null;
  status: string;
  // الرسالة الصادرة المخزنة — يستخدمها الويدجت لمنع تكرارها في الاستطلاع
  replyMessage?: { id: string; createdAt: string };
}> {
  const { workspaceId, agent, waPhone, contactName, text, platform } = opts;

  // ٢. إيجاد أو إنشاء جهة الاتصال
  const contact = await prisma.contact.upsert({
    where: { workspaceId_waPhone: { workspaceId, waPhone } },
    update: contactName ? { name: contactName } : {},
    create: { workspaceId, waPhone, name: contactName },
  });

  // ٣. إيجاد محادثة مفتوحة أو إنشاء واحدة جديدة
  let conversation = opts.conversationId
    ? await prisma.conversation.findFirst({
        where: { id: opts.conversationId, workspaceId },
      })
    : await prisma.conversation.findFirst({
        where: { contactId: contact.id, platform, isArchived: false },
      });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        contactId: contact.id,
        agentId: agent.id,
        platform,
        status: "AI",
      },
    });
  }

  // ٤. حفظ الرسالة الواردة (ونحسب إن كانت الأولى قبل الحفظ)
  const previousInbound = await prisma.message.count({
    where: { conversationId: conversation.id, direction: "INBOUND" },
  });
  const inboundMsg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      body: text,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  // بث فوري لصندوق الوارد — لا يؤثر على شيء إن لم يكن Pusher مفعّلاً
  triggerNewMessage(workspaceId, conversation.id, inboundMsg);
  triggerConversationUpdated(workspaceId, conversation.id);

  // ٥. عدّ الاستهلاك الشهري
  await incrementUsage(workspaceId);

  // ٦. كلمات التسليم: تحويل المحادثة لموظف دون رد آلي
  const normalized = normalize(text);
  if (
    conversation.status === "AI" &&
    agent.handoffKeywords.some(
      (k) => k.trim() && normalized.includes(normalize(k))
    )
  ) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "HANDED_OFF" },
    });
    // TODO: هنا يُرسل تنبيه للفريق (بريد/إشعار) عند تسليم محادثة
    console.log(`[agent-engine] تسليم محادثة ${conversation.id} بسبب كلمة تسليم`);
    return { conversationId: conversation.id, reply: null, status: "HANDED_OFF" };
  }

  // ٧. تحكم بشري (يدوي أو مسلّم) — نتوقف دون رد
  if (conversation.status !== "AI") {
    return { conversationId: conversation.id, reply: null, status: conversation.status };
  }

  // ٨. الرد الآلي — انتظار بسيط يجمع الرسائل المتتابعة (MVP)
  // في الإنتاج: استخدم طابور مهام يدمج الرسائل خلال نافذة الانتظار
  if (agent.responseDelaySec > 0) {
    await new Promise((r) => setTimeout(r, agent.responseDelaySec * 1000));
  }

  let reply: string | null;
  if (previousInbound === 0 && agent.welcomeMessage) {
    // أول رسالة من العميل في هذه المحادثة → رسالة الترحيب
    reply = agent.welcomeMessage;
  } else {
    const history: ChatMessage[] = (
      await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    )
      .reverse()
      .map((m) => ({
        role: m.direction === "INBOUND" ? ("user" as const) : ("assistant" as const),
        content: m.body,
      }));
    const knowledge = retrieveRelevantKnowledge(agent.knowledgeSources, text);
    // مفتاح OpenAI من إعدادات مساحة العمل مع .env كبديل
    const openaiKey = await getIntegration(workspaceId, "OPENAI_API_KEY");
    reply = await generateReply(history, agent.systemPrompt, knowledge, openaiKey);
  }

  if (!reply) {
    // غياب المفتاح أو خطأ في OpenAI — نسجل ونتخطى دون إسقاط الويب هوك
    console.log("[agent-engine] تعذّر توليد رد (مفتاح مفقود أو خطأ في الخدمة)");
    return { conversationId: conversation.id, reply: null, status: "AI" };
  }

  // إرسال الرد خارجياً (لواتساب فقط؛ الويدجت يستلمه من القيمة المعادة)
  await opts.sendReply(waPhone, reply);

  const replyMsg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      senderType: "AI",
      body: reply,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
  await incrementUsage(workspaceId);

  // بث الرد الآلي لصندوق الوارد فورياً
  triggerNewMessage(workspaceId, conversation.id, replyMsg);
  triggerConversationUpdated(workspaceId, conversation.id);

  return {
    conversationId: conversation.id,
    reply,
    status: "AI",
    replyMessage: { id: replyMsg.id, createdAt: replyMsg.createdAt.toISOString() },
  };
}

// تخزين الرسالة الواردة دون وكيل نشط — محادثة يدوية تظهر في صندوق الوارد
async function storeInboundWithoutAgent(input: {
  waPhone: string;
  contactName: string | null;
  text: string;
}): Promise<void> {
  // MVP أحادي المستأجر: نختار أول مساحة عمل
  const workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    console.log("[agent-engine] لا توجد مساحة عمل — تم تجاهل الرسالة");
    return;
  }

  const contact = await prisma.contact.upsert({
    where: {
      workspaceId_waPhone: { workspaceId: workspace.id, waPhone: input.waPhone },
    },
    update: input.contactName ? { name: input.contactName } : {},
    create: {
      workspaceId: workspace.id,
      waPhone: input.waPhone,
      name: input.contactName,
    },
  });

  let conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, platform: "WHATSAPP", isArchived: false },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId: workspace.id,
        contactId: contact.id,
        platform: "WHATSAPP",
        status: "MANUAL",
      },
    });
  }

  const msg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      body: input.text,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
  await incrementUsage(workspace.id);

  triggerNewMessage(workspace.id, conversation.id, msg);
  triggerConversationUpdated(workspace.id, conversation.id);
}

// نقطة دخول رسائل واتساب الواردة من الويب هوك
export async function handleIncomingWhatsAppMessage(input: {
  waPhone: string;
  contactName: string | null;
  text: string;
}): Promise<void> {
  try {
    // MVP: رقم واتساب واحد لكل تثبيت — نختار أول وكيل نشط لأي مساحة عمل
    // لاحقاً: ربط الرقم بمساحة عمل عبر WHATSAPP_PHONE_NUMBER_ID
    const agent = await prisma.agent.findFirst({
      where: { isActive: true },
      include: { knowledgeSources: true },
    });
    if (!agent) {
      // لا يوجد وكيل نشط — نحفظ الرسالة في صندوق الوارد دون رد آلي حتى لا تضيع
      await storeInboundWithoutAgent(input);
      return;
    }

    // بيانات واتساب من إعدادات مساحة العمل مع .env كبديل
    // ميتا أولاً، وإن كانت حقوله فارغة نستخدم UltraMsg
    const waCreds = await resolveWhatsAppCreds(agent.workspaceId);

    await runPipeline({
      workspaceId: agent.workspaceId,
      agent,
      waPhone: input.waPhone,
      contactName: input.contactName,
      text: input.text,
      platform: "WHATSAPP",
      sendReply: (to, body) => sendWhatsAppMessage(to, body, waCreds),
    });
  } catch (e) {
    // لا ندع الويب هوك يفشل أبداً — ميتا تعيد إرسال الحدث عند 5xx
    console.error("[agent-engine] خطأ في خط المعالجة:", e);
  }
}

// نقطة دخول رسائل الويدجت — نفس خط المعالجة لكن الرد يُعاد للمتصل
// بدل إرساله عبر واتساب (يستدعيها app/api/widget/route.ts)
export async function handleIncomingWidgetMessage(input: {
  workspaceId: string;
  agentId: string;
  visitorId: string;
  visitorName: string | null;
  text: string;
  conversationId?: string;
}): Promise<{
  conversationId: string;
  reply: string | null;
  status: string;
  replyMessage?: { id: string; createdAt: string };
} | null> {
  try {
    const agent = await prisma.agent.findFirst({
      where: { id: input.agentId, workspaceId: input.workspaceId },
      include: { knowledgeSources: true },
    });
    if (!agent) return null;

    // زائر الويدجت بلا هاتف — معرّف الزائر هو مفتاح جهة الاتصال الثابت
    const waPhone = `widget:${input.visitorId}`;

    return await runPipeline({
      workspaceId: input.workspaceId,
      agent,
      waPhone,
      contactName: input.visitorName,
      text: input.text,
      platform: "WIDGET",
      conversationId: input.conversationId,
      sendReply: async () => true,
    });
  } catch (e) {
    console.error("[agent-engine] خطأ في رسالة الويدجت:", e);
    return null;
  }
}
