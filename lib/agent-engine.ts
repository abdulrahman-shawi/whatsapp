import type { Agent, KnowledgeSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateReply, resolveAiConfig, type ChatMessage } from "@/lib/openai";
import { resolveWhatsAppCreds, sendWhatsAppMessage } from "@/lib/whatsapp";
import { collectAgentKnowledge } from "@/lib/retrieval";
import { triggerNewMessage, triggerConversationUpdated } from "@/lib/pusher";
import { getUsageStatus } from "@/lib/billing/plans";
import { triggerWorkflows } from "@/lib/workflows";

type AgentWithKnowledge = Agent & { knowledgeSources: KnowledgeSource[] };

// مفتاح الشهر الحالي لسجل الاستهلاك، مثل "2025-01"
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// زيادة عدّاد الرسائل والتوكنات الشهري لمساحة العمل
// tokens: استهلاك OpenAI الفعلي للرد الآلي (0 للرسائل التي لا تمر على الذكاء الاصطناعي)
async function incrementUsage(workspaceId: string, tokens = 0) {
  const month = currentMonth();
  await prisma.usageRecord.upsert({
    where: { workspaceId_month: { workspaceId, month } },
    update: {
      messagesUsed: { increment: 1 },
      ...(tokens > 0 ? { tokensUsed: { increment: tokens } } : {}),
    },
    create: { workspaceId, month, messagesUsed: 1, tokensUsed: tokens },
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
  media?: { mediaId: string; mediaMime: string | null; mediaType: string | null };
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

  // ٢. إيجاد أو إنشاء جهة الاتصال — مع كشف العملاء الجدد لمحفّز سير العمل
  const existingContact = await prisma.contact.findFirst({
    where: { workspaceId, waPhone },
  });
  const contact = existingContact
    ? await prisma.contact.update({
        where: { id: existingContact.id },
        data: contactName ? { name: contactName } : {},
      })
    : await prisma.contact.create({
        data: { workspaceId, waPhone, name: contactName },
      });
  const isNewContact = !existingContact;

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
      // وسائط واتساب الواردة: معرّف وسيط ميتا ونوعه وصيغته
      ...(opts.media
        ? {
            mediaId: opts.media.mediaId,
            mediaMime: opts.media.mediaMime,
            mediaType: opts.media.mediaType,
          }
        : {}),
    },
  });
  // إعادة فتح المحادثة إن كانت مغلقة — رسالة العميل الجديدة تعيدها للوارد
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), closedAt: null },
  });

  // بث فوري لصندوق الوارد — لا يؤثر على شيء إن لم يكن Pusher مفعّلاً
  triggerNewMessage(workspaceId, conversation.id, inboundMsg);
  triggerConversationUpdated(workspaceId, conversation.id);

  // ٥. عدّ الاستهلاك الشهري
  await incrementUsage(workspaceId);

  // ٥.ب مطابقة سير العمل: كلمات مفتاحية / أرقام محددة / عميل جديد
  // ننتظر اكتمالها — قد تغيّر حالة المحادثة (إيقاف الرد الآلي/إغلاق/إسناد)
  const workflowCtx = {
    workspaceId,
    contactId: contact.id,
    waPhone,
    contactName,
    text,
    conversationId: conversation.id,
    vars: {},
  };
  await triggerWorkflows(workspaceId, "KEYWORD", {}, workflowCtx).catch(() => {});
  await triggerWorkflows(workspaceId, "FROM_NUMBERS", {}, workflowCtx).catch(() => {});
  if (isNewContact) {
    await triggerWorkflows(workspaceId, "NEW_CONTACT", {}, workflowCtx).catch(() => {});
  }

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
  // نقرأ الحالة حديثة من القاعدة: سير العمل قد يكون حوّلها للتحكم اليدوي للتو
  const freshStatus = (
    await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { status: true },
    })
  )?.status ?? conversation.status;
  if (freshStatus !== "AI") {
    return { conversationId: conversation.id, reply: null, status: freshStatus };
  }

  // ٧.ب حد الباقة: استنفاد رصيد الرسائل أو توكنات الذكاء الاصطناعي يوقف الرد
  // الآلي ويسلّم المحادثة للفريق (الرسائل اليدوية البشرية غير محدودة)
  const usage = await getUsageStatus(workspaceId);
  if (usage.remaining <= 0 || usage.tokens.remaining <= 0) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "HANDED_OFF" },
    });
    const exhausted =
      usage.remaining <= 0
        ? `الرسائل (${usage.used}/${usage.limit})`
        : `توكنات الذكاء الاصطناعي (${usage.tokens.used}/${usage.tokens.limit})`;
    console.warn(
      `[agent-engine] استنفاد رصيد الباقة للمساحة ${workspaceId} — ${exhausted} — أُوقف الرد الآلي وسُلّمت المحادثة`
    );
    return { conversationId: conversation.id, reply: null, status: "HANDED_OFF" };
  }

  // ٨. الرد الآلي — انتظار بسيط يجمع الرسائل المتتابعة (MVP)
  // في الإنتاج: استخدم طابور مهام يدمج الرسائل خلال نافذة الانتظار
  if (agent.responseDelaySec > 0) {
    await new Promise((r) => setTimeout(r, agent.responseDelaySec * 1000));
  }

  let reply: string | null;
  let tokensUsed = 0; // توكنات OpenAI الفعلية لهذا الرد — تُحتسب عند نجاح التوليد
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
    // معرفة الوكيل: نصوص وملفات + نتائج استعلامات قواعد البيانات الخارجية لرقم العميل
    const knowledge = await collectAgentKnowledge(
      agent.knowledgeSources,
      text,
      waPhone
    );
    // إعدادات الذكاء الاصطناعي من إعدادات مساحة العمل مع .env كبديل
    const aiConfig = await resolveAiConfig(workspaceId);
    const aiReply = await generateReply(history, agent.systemPrompt, knowledge, aiConfig);
    reply = aiReply?.content ?? null;
    // استهلاك التوكنات الفعلي — يُخصم من رصيد الباقة الشهري
    if (aiReply) tokensUsed = aiReply.usage.totalTokens;
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
  await incrementUsage(workspaceId, tokensUsed);

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
  workspaceId?: string;
  media?: { mediaId: string; mediaMime: string | null; mediaType: string | null };
}): Promise<void> {
  // Multi-tenant: نستخدم مساحة العمل المحلولة من رقم الهاتف،
  // وإن تعذّرت نعود لأول مساحة عمل (سلوك احتياطي قديم)
  let workspaceId = input.workspaceId;
  if (!workspaceId) {
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      console.log("[agent-engine] لا توجد مساحة عمل — تم تجاهل الرسالة");
      return;
    }
    workspaceId = workspace.id;
  }

  const contact = await prisma.contact.upsert({
    where: {
      workspaceId_waPhone: { workspaceId, waPhone: input.waPhone },
    },
    update: input.contactName ? { name: input.contactName } : {},
    create: {
      workspaceId,
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
        workspaceId,
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
      // وسائط واتساب الواردة: معرّف وسيط ميتا ونوعه وصيغته
      ...(input.media
        ? {
            mediaId: input.media.mediaId,
            mediaMime: input.media.mediaMime,
            mediaType: input.media.mediaType,
          }
        : {}),
    },
  });
  // إعادة فتح المحادثة إن كانت مغلقة — رسالة العميل الجديدة تعيدها للوارد
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), closedAt: null },
  });
  await incrementUsage(workspaceId);

  triggerNewMessage(workspaceId, conversation.id, msg);
  triggerConversationUpdated(workspaceId, conversation.id);
}

// نقطة دخول رسائل واتساب الواردة من الويب هوك
export async function handleIncomingWhatsAppMessage(input: {
  waPhone: string;
  contactName: string | null;
  text: string;
  // مساحة العمل المحلولة من معرّف رقم الهاتف — غائبة في الاحتياط القديم
  workspaceId?: string;
  media?: { mediaId: string; mediaMime: string | null; mediaType: string | null };
}): Promise<void> {
  try {
    // Multi-tenant: نبحث عن الوكيل النشط داخل مساحة العمل المالكة للرقم،
    // وعند غيابها نعود لأول وكيل نشط (سلوك احتياطي قديم)
    const agent = input.workspaceId
      ? await prisma.agent.findFirst({
          where: { isActive: true, workspaceId: input.workspaceId },
          include: { knowledgeSources: true },
        })
      : await prisma.agent.findFirst({
          where: { isActive: true },
          include: { knowledgeSources: true },
        });
    if (!agent) {
      if (input.workspaceId) {
        console.warn(
          `[agent-engine] لا وكيل نشط في المساحة ${input.workspaceId} — تُخزن الرسالة يدوياً`
        );
      }
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
      media: input.media,
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
