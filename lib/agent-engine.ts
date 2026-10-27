import type { Agent, KnowledgeSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveAiConfig, type ChatMessage } from "@/lib/openai";
import { generateWorkspaceReply } from "@/lib/billing/ai-usage";
import { downloadMetaAudio, transcribeAudio } from "@/lib/audio-transcription";
import {
  resolveWhatsAppCreds,
  sendWhatsAppMedia,
  sendWhatsAppMessage,
  uploadWhatsAppMedia,
  type WhatsAppCreds,
  type WhatsAppResult,
} from "@/lib/whatsapp";
import { outboundDeliveryFields } from "@/lib/message-delivery";
import { collectAgentKnowledge } from "@/lib/retrieval";
import { buildAgentSystemPrompt, parseSkills } from "@/lib/agent-prompt";
import { toolsForSkills } from "@/lib/agent-skills";
import { runAgentTools } from "@/lib/agent-tools";
import { triggerNewMessage, triggerConversationUpdated } from "@/lib/pusher";
import { getUsageStatus } from "@/lib/billing/plans";
import {
  triggerWorkflows,
  getWorkspaceBusinessHours,
  type WorkflowContext,
} from "@/lib/workflows";
import { getIntegration } from "@/lib/settings";
import {
  detectConversationTopic,
  detectLanguage,
  isCriticalMessage,
  detectSentiment,
  LANGUAGE_NAMES,
} from "@/lib/sentiment";
import { notifyUser } from "@/lib/notify";
import { fireOutboundEvent } from "@/lib/outbound-webhooks";
import { recalculateLeadScore } from "@/lib/scoring";
import { escalateCriticalConversation } from "@/lib/critical-conversations";
import { synthesizeVoiceReply } from "@/lib/text-to-speech";
import { parseCsatRating } from "@/lib/csat";
import { workspaceIsReadOnly } from "@/lib/billing/workspace-access";

type AgentWithKnowledge = Agent & { knowledgeSources: KnowledgeSource[] };

// إشعار من سُندت إليهم المحادثة برسالة واردة جديدة (داخلي + Push)
// مفصول عن خط المعالجة تماماً: أي خطأ هنا لا يوقف الويب هوك
async function notifyInboundAssignees(
  workspaceId: string,
  conversationId: string,
  fromLabel: string,
  text: string
): Promise<void> {
  try {
    const assignees = await prisma.conversationAssignee.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    if (assignees.length === 0) return;
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    await Promise.all(
      assignees.map((a) =>
        notifyUser({
          workspaceId,
          userId: a.userId,
          type: "MESSAGE",
          title: `رسالة جديدة من ${fromLabel}`,
          body: preview,
          link: `/inbox?c=${conversationId}`,
        })
      )
    );
  } catch (e) {
    console.error("[agent-engine] تعذّر إشعار المسند إليهم:", e);
  }
}

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

// تنبيه داخلي واحد لكل مساحة عمل ولكل شهر — يُنشأ عند استنفاد الرصيد أو الاقتراب من الحد،
// ولا يتكرر ما دام تنبيه سابق بنفس النوع غير مقروء منذ بداية الشهر
async function notifyUsageAlert(
  workspaceId: string,
  title: string,
  body: string
): Promise<void> {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const existing = await prisma.notification.findFirst({
      where: {
        workspaceId,
        type: "USAGE_ALERT",
        readAt: null,
        createdAt: { gte: monthStart },
      },
      select: { id: true },
    });
    if (existing) return;
    await prisma.notification.create({
      data: {
        workspaceId,
        userId: null, // null = الفريق كله
        type: "USAGE_ALERT",
        title,
        body,
        link: "/settings",
      },
    });
  } catch (e) {
    // فشل الإشعار لا يعطّل معالجة الرسائل أبداً
    console.error("[agent-engine] تعذّر إنشاء تنبيه الاستهلاك:", e);
  }
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
  waMessageId?: string;
  platform: "WHATSAPP" | "WIDGET";
  conversationId?: string;
  referral?: {
    sourceType?: string;
    sourceUrl?: string;
    sourceId?: string;
    headline?: string;
    body?: string;
    clickId?: string;
  };
  media?: { mediaId: string; mediaMime: string | null; mediaType: string | null };
  sendReply: (to: string, body: string) => Promise<WhatsAppResult>;
  sendVoiceReply?: (
    to: string,
    audio: Buffer
  ) => Promise<{ result: WhatsAppResult; mediaId: string | null }>;
};

async function sendAgentReply(
  opts: PipelineOptions,
  agent: AgentWithKnowledge,
  to: string,
  body: string
): Promise<{
  voiceSent: boolean;
  mediaId: string | null;
  result: WhatsAppResult;
}> {
  if (agent.voiceReplies && opts.platform === "WHATSAPP" && opts.sendVoiceReply) {
    const audio = await synthesizeVoiceReply(
      body,
      await resolveAiConfig()
    );
    if (audio) {
      try {
        const voice = await opts.sendVoiceReply(to, audio);
        if (voice.result.ok) {
          return { voiceSent: true, mediaId: voice.mediaId, result: voice.result };
        }
        console.error(
          "[agent-engine] فشل إرسال الرد الصوتي؛ سيُرسل كنص:",
          voice.result.error
        );
      } catch (error) {
        console.error("[agent-engine] تعذّر إرسال الرد الصوتي؛ سيُرسل كنص:", error);
      }
    }
  }
  const result = await opts.sendReply(to, body);
  return { voiceSent: false, mediaId: null, result };
}

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
  // الاسم الوارد من واتساب (اسم الملف الشخصي) يُعتمد فقط إذا لم يكن للعميل اسم —
  // حفاظاً على الاسم الذي عدّله الفريق يدوياً من لوحة جهة الاتصال
  const contact = existingContact
    ? await prisma.contact.update({
        where: { id: existingContact.id },
        data: contactName && !existingContact.name ? { name: contactName } : {},
      })
    : await prisma.contact.create({
        data: { workspaceId, waPhone, name: contactName },
      });
  const isNewContact = !existingContact;
  if (isNewContact) {
    fireOutboundEvent(workspaceId, "contact.created", {
      id: contact.id,
      waPhone,
      name: contact.name,
    });
  }

  // ٣. إيجاد محادثة مفتوحة أو إنشاء واحدة جديدة
  let conversation = opts.conversationId
    ? await prisma.conversation.findFirst({
        where: { id: opts.conversationId, workspaceId },
      })
    : await prisma.conversation.findFirst({
        where: { contactId: contact.id, platform, isArchived: false },
      });
  const isNewConversation = !conversation;
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
      waMessageId: opts.waMessageId ?? null,
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
  // تحديث نقاط تقييم العميل المحتمل بعد الرسالة الواردة — لا يحجب المعالجة
  void recalculateLeadScore(contact.id);

  // إطلاق ويب هوك صادر: رسالة واردة جديدة — لا يحجب المعالجة
  fireOutboundEvent(workspaceId, "message.created", {
    id: inboundMsg.id,
    direction: inboundMsg.direction,
    body: text.length > 500 ? `${text.slice(0, 500)}…` : text,
    from: waPhone,
    conversationId: conversation.id,
  });

  // إعادة فتح المحادثة إن كانت مغلقة — رسالة العميل الجديدة تعيدها للوارد
  // (إجابة تقييم الرضا وحدها لا تعيد الفتح)
  // + تحديث مزاج/نية العميل من نص رسالته (شارة الأولوية في الوارد)
  const ratingNum = parseCsatRating(text);
  const isCsatAnswer = conversation.csatPending && ratingNum !== null;
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      closedAt: isCsatAnswer ? conversation.closedAt : null,
      sentiment: detectSentiment(text),
      topic: isCsatAnswer ? conversation.topic : detectConversationTopic(text),
    },
  });
  if (!isCsatAnswer && isCriticalMessage(text)) {
    await escalateCriticalConversation(
      workspaceId,
      conversation.id
    ).catch((error) => {
      console.error("[agent-engine] تعذّر تصعيد المحادثة الحرجة:", error);
    });
  }

  // بث فوري لصندوق الوارد — لا يؤثر على شيء إن لم يكن Pusher مفعّلاً
  triggerNewMessage(workspaceId, conversation.id, inboundMsg);
  triggerConversationUpdated(workspaceId, conversation.id);

  // إشعار المسند إليهم بالرسالة الواردة — بلا انتظار حتى لا يبطئ الخط
  void notifyInboundAssignees(
    workspaceId,
    conversation.id,
    contactName ?? waPhone,
    text
  );

  // ٥. عدّ الاستهلاك الشهري
  await incrementUsage(workspaceId);

  // ٥.أ إجابة تقييم الرضا: نسجّل التقييم، نشكر العميل، ونتوقف — بلا ذكاء اصطناعي
  // ولا محفّزات سير عمل ولا كلمات تسليم على رسالة التقييم
  if (isCsatAnswer && ratingNum !== null) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { csatRating: ratingNum, csatPending: false },
    });
    const thanksText = "شكراً لتقييمك! نقدّر ثقتك 🌟";
    try {
      const result = await opts.sendReply(waPhone, thanksText);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          senderType: "AI",
          body: thanksText,
          ...(platform === "WHATSAPP" ? outboundDeliveryFields(result) : {}),
        },
      });
      if (!result.ok) {
        console.error("[agent-engine] فشل إرسال شكر التقييم:", result.error);
      }
      console.log(`[agent-engine] تسجيل تقييم رضا ${ratingNum}/٥ للمحادثة ${conversation.id}`);
    } catch (e) {
      console.error(
        `[agent-engine] فشل إرسال شكر التقييم للمحادثة ${conversation.id}:`,
        e instanceof Error ? e.message : e
      );
    }
    return { conversationId: conversation.id, reply: null, status: "AI" };
  }

  // ٥.ب مطابقة سير العمل: كلمات مفتاحية / أرقام محددة / عميل جديد
  // ننتظر اكتمالها — قد تغيّر حالة المحادثة (إيقاف الرد الآلي/إغلاق/إسناد)
  const workflowCtx: WorkflowContext = {
    workspaceId,
    contactId: contact.id,
    waPhone,
    contactName,
    text,
    conversationId: conversation.id,
    vars: opts.referral
      ? {
          ad_source_url: opts.referral.sourceUrl ?? "",
          ad_source_id: opts.referral.sourceId ?? "",
          ad_headline: opts.referral.headline ?? "",
          ad_body: opts.referral.body ?? "",
          ctwa_clid: opts.referral.clickId ?? "",
        }
      : {},
  };
  if (isNewConversation) {
    await triggerWorkflows(workspaceId, "CONVERSATION_STARTED", {}, workflowCtx).catch((e) =>
      console.error("[agent-engine] فشل تشغيل محفّز بدء المحادثة:", e)
    );
  }
  if (existingContact && !existingContact.name && contact.name) {
    await triggerWorkflows(
      workspaceId,
      "CONTACT_FIELD_UPDATED",
      { field: "name" },
      { ...workflowCtx, vars: { field: "name", value: contact.name } }
    ).catch((e) => console.error("[agent-engine] فشل تشغيل محفّز تحديث الاسم:", e));
  }
  await triggerWorkflows(workspaceId, "KEYWORD", {}, workflowCtx).catch(() => {});
  await triggerWorkflows(workspaceId, "FROM_NUMBERS", {}, workflowCtx).catch(() => {});
  if (isNewContact) {
    await triggerWorkflows(workspaceId, "NEW_CONTACT", {}, workflowCtx).catch(() => {});
  }
  if (opts.referral?.sourceType === "ad" || opts.referral?.clickId) {
    await triggerWorkflows(workspaceId, "CLICK_TO_CHAT_AD", {}, workflowCtx).catch((e) =>
      console.error("[agent-engine] فشل تشغيل محفّز إعلان النقر للدردشة:", e)
    );
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
  if (await workspaceIsReadOnly(workspaceId)) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "HANDED_OFF" },
    });
    return {
      conversationId: conversation.id,
      reply: null,
      status: "HANDED_OFF",
    };
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
    // تنبيه الفريق فور توقف الرد الآلي — مرة واحدة بالشهر، ولا يعطّل المعالجة عند فشله
    void notifyUsageAlert(
      workspaceId,
      "استنفاد رصيد الباقة",
      `توقّف الرد الآلي لاستنفاد ${exhausted}. رقِّ خطتك من الإعدادات أو انتظر بداية الشهر.`
    );
    return { conversationId: conversation.id, reply: null, status: "HANDED_OFF" };
  }

  // ٧.ج خارج الدوام نرسل رسالة ثابتة بدلاً من استدعاء الذكاء الاصطناعي.
  // لا يصل هذا الفرع إلا لمحادثات حالتها AI (المسلَّمة/اليدوية تتوقف عند الفحص أعلاه)،
  // ويمر عبر نفس مسار الإرسال والتخزين والبث الذي يمر به الرد الذكي
  {
    const businessHours = await getWorkspaceBusinessHours(workspaceId);
    if (businessHours.configured && !businessHours.isOpen) {
      if (agent.responseDelaySec > 0) {
        await new Promise((r) => setTimeout(r, agent.responseDelaySec * 1000));
      }
      const nextOpening = businessHours.nextOpeningLabel ?? "في أقرب وقت";
      const offReply = agent.offHoursReply?.trim()
        ? agent.offHoursReply
            .replace(/\{\{nextOpening\}\}/g, nextOpening)
            .replace(/\{\{openingTime\}\}/g, nextOpening)
        : `شكراً لتواصلك معنا. نعود للعمل ${nextOpening}، وسنرد عليك حينها.`;
      const delivery = await sendAgentReply(opts, agent, waPhone, offReply);
      const replyMsg = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          senderType: "AI",
          body: offReply,
          ...(delivery.voiceSent
            ? {
                mediaId: delivery.mediaId,
                mediaType: "audio",
                mediaMime: "audio/ogg; codecs=opus",
              }
            : {}),
          ...(platform === "WHATSAPP"
            ? outboundDeliveryFields(delivery.result)
            : {}),
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
      if (delivery.result.ok) await incrementUsage(workspaceId);
      triggerNewMessage(workspaceId, conversation.id, replyMsg);
      triggerConversationUpdated(workspaceId, conversation.id);
      return {
        conversationId: conversation.id,
        reply: offReply,
        status: "AI",
        replyMessage: { id: replyMsg.id, createdAt: replyMsg.createdAt.toISOString() },
      };
    }
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
    // معرفة الوكيل: نصوص وملفات + نتائج استعلامات قواعد البيانات الخارجية لرقم العميل
    const knowledge = await collectAgentKnowledge(
      agent.knowledgeSources,
      text,
      waPhone
    );
    // تدريب من المحادثات: حقن أمثلة الردود التي علّمها الفريق "جيدة" في البرومبت
    // + تعليمة الرد بلغة العميل نفسها (كشف مجاني بلا توكنات)
    const goodExamples = await prisma.message.findMany({
      where: { rating: "GOOD", conversation: { workspaceId } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { body: true },
    });
    const lang = detectLanguage(text);
    const styleHints = [
      `أجب بلغة العميل نفسها (${LANGUAGE_NAMES[lang]}) حتى لو اختلفت لغة تعليماتك.`,
      ...(goodExamples.length > 0
        ? [
            "أمثلة على ردود اعتمدها الفريق وسجّلها جيدة — حافظ على أسلوبها وطولها تقريباً:",
            ...goodExamples.map((g) => `• ${g.body}`),
          ]
        : []),
    ];
    // إعدادات الذكاء الاصطناعي من لوحة مالك المنصة — موحّدة لكل المساحات
    const aiConfig = await resolveAiConfig();
    // برومبت النظام الكامل: الأساس + أقسام التعليمات + سلوكيات المهارات
    const systemPrompt = buildAgentSystemPrompt(agent);
    // أدوات المهارات المفعّلة — بلا مهارات يكون النداء الاعتيادي بلا أدوات
    const skills = parseSkills(agent.skills);
    const tools = skills.length > 0 ? toolsForSkills(skills) : undefined;

    const knowledgeAndStyle = [...knowledge, ...styleHints];
    const conversationMessages: ChatMessage[] = [...history];
    let result = await generateWorkspaceReply(
      workspaceId,
      conversationMessages,
      systemPrompt,
      knowledgeAndStyle,
      aiConfig,
      2048,
      undefined,
      tools
    );

    // حلقة أدوات المهارات: عندما يطلب النموذج تنفيذ أدوات ننفّذها ونحقن النتائج
    // ثم نعيد التوليد للرد النهائي — بحد أقصى تكرارين لتفادي حلقات الاستدعاء
    for (let round = 0; result.reply?.toolCalls?.length && round < 2; round++) {
      const toolCalls = result.reply.toolCalls;
      const toolResults = await runAgentTools(toolCalls, {
        workspaceId,
        contactId: contact.id,
        conversationId: conversation.id,
      });
      conversationMessages.push({
        role: "assistant",
        content: result.reply.content,
        toolCalls,
      });
      for (const r of toolResults) {
        const call = toolCalls.find((c) => c.id === r.toolCallId);
        conversationMessages.push({
          role: "tool",
          toolCallId: r.toolCallId,
          name: call?.name ?? "",
          content: r.content,
        });
      }
      result = await generateWorkspaceReply(
        workspaceId,
        conversationMessages,
        systemPrompt,
        knowledgeAndStyle,
        aiConfig,
        2048,
        undefined,
        tools
      );
    }

    reply = result.reply?.content?.trim() ? result.reply.content : null;
    if (result.trialExpired) {
      console.warn(`[agent-engine] انتهت التجربة المجانية للمساحة ${workspaceId}`);
    } else if (result.quotaExceeded) {
      console.warn(`[agent-engine] استنفاد رصيد توكنات الذكاء الاصطناعي للمساحة ${workspaceId}`);
    }
  }

  if (!reply) {
    // غياب المفتاح أو خطأ في OpenAI — نسجل ونتخطى دون إسقاط الويب هوك
    console.log("[agent-engine] تعذّر توليد رد (مفتاح مفقود أو خطأ في الخدمة)");
    return { conversationId: conversation.id, reply: null, status: "AI" };
  }

  // إرسال الرد خارجياً (لواتساب فقط؛ الويدجت يستلمه من القيمة المعادة)
  const delivery = await sendAgentReply(opts, agent, waPhone, reply);

  const replyMsg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      senderType: "AI",
      body: reply,
      ...(delivery.voiceSent
        ? {
            mediaId: delivery.mediaId,
            mediaType: "audio",
            mediaMime: "audio/ogg; codecs=opus",
          }
        : {}),
      ...(platform === "WHATSAPP"
        ? outboundDeliveryFields(delivery.result)
        : {}),
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
  if (delivery.result.ok) await incrementUsage(workspaceId);

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
  waMessageId?: string;
  workspaceId: string;
  media?: { mediaId: string; mediaMime: string | null; mediaType: string | null };
}): Promise<void> {
  const workspaceId = input.workspaceId;

  // لا نستبدل اسماً موجوداً — الاسم المعدل يدوياً أو المسجل سابقاً له الأولوية
  const existingForName = await prisma.contact.findFirst({
    where: { workspaceId, waPhone: input.waPhone },
    select: { name: true },
  });
  const isNewContact = !existingForName;
  const contact = await prisma.contact.upsert({
    where: {
      workspaceId_waPhone: { workspaceId, waPhone: input.waPhone },
    },
    update:
      input.contactName && !existingForName?.name
        ? { name: input.contactName }
        : {},
    create: {
      workspaceId,
      waPhone: input.waPhone,
      name: input.contactName,
    },
  });

  let conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, platform: "WHATSAPP", isArchived: false },
  });
  const isNewConversation = !conversation;
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
      waMessageId: input.waMessageId ?? null,
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
  const ratingNum = parseCsatRating(input.text);
  const isCsatAnswer = conversation.csatPending && ratingNum !== null;
  // إعادة فتح المحادثة إن كانت مغلقة — رسالة العميل الجديدة تعيدها للوارد
  // + تحديث مزاج/نية العميل من نص رسالته (شارة الأولوية في الوارد)
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      closedAt: isCsatAnswer ? conversation.closedAt : null,
      sentiment: detectSentiment(input.text),
      topic: isCsatAnswer
        ? conversation.topic
        : detectConversationTopic(input.text),
      ...(isCsatAnswer
        ? { csatRating: ratingNum, csatPending: false }
        : {}),
    },
  });
  if (isCriticalMessage(input.text)) {
    await escalateCriticalConversation(
      workspaceId,
      conversation.id
    ).catch((error) => {
      console.error("[agent-engine] تعذّر تصعيد المحادثة الحرجة:", error);
    });
  }
  await incrementUsage(workspaceId);

  const workflowContext: WorkflowContext = {
    workspaceId,
    contactId: contact.id,
    waPhone: input.waPhone,
    contactName: contact.name,
    text: input.text,
    conversationId: conversation.id,
    stage: contact.stage,
    tags: contact.tags,
    vars: {},
  };
  if (isNewConversation) {
    await triggerWorkflows(workspaceId, "CONVERSATION_STARTED", {}, workflowContext);
  }
  if (existingForName && !existingForName.name && contact.name) {
    await triggerWorkflows(
      workspaceId,
      "CONTACT_FIELD_UPDATED",
      { field: "name" },
      { ...workflowContext, vars: { field: "name", value: contact.name } }
    );
  }
  if (isNewContact) {
    await triggerWorkflows(workspaceId, "NEW_CONTACT", {}, workflowContext);
  }

  triggerNewMessage(workspaceId, conversation.id, msg);
  triggerConversationUpdated(workspaceId, conversation.id);
}

// نقطة دخول رسائل واتساب الواردة من الويب هوك
export async function handleIncomingWhatsAppMessage(input: {
  waPhone: string;
  contactName: string | null;
  text: string;
  waMessageId?: string;
  // مساحة العمل المحلولة من معرّف رقم الهاتف — إلزامية لمنع خلط المستأجرين
  workspaceId: string;
  media?: { mediaId: string; mediaMime: string | null; mediaType: string | null };
  referral?: PipelineOptions["referral"];
}): Promise<void> {
  try {
    // منع تكرار الرسالة حتى لو أعاد المزود الحدث بمعرف طابور مختلف.
    if (input.waMessageId) {
      const existing = await prisma.message.findUnique({
        where: { waMessageId: input.waMessageId },
        select: { id: true },
      });
      if (existing) return;
    }

    // رقم محظور — نتجاهل الرسالة تماماً: لا محادثة جديدة ولا رد آلي
    const blockedContact = await prisma.contact.findFirst({
      where: { workspaceId: input.workspaceId, waPhone: input.waPhone, blocked: true },
      select: { id: true },
    });
    if (blockedContact) {
      console.log(`[agent-engine] رسالة من رقم محظور (${input.waPhone}) — تم التجاهل`);
      return;
    }

    // لا يجوز اختيار وكيل من مساحة أخرى عند تعذر التوجيه.
    const agent = await prisma.agent.findFirst({
      where: { isActive: true, workspaceId: input.workspaceId },
      include: { knowledgeSources: true },
    });
    const workspaceId = input.workspaceId;
    let text = input.text;
    let waCreds: WhatsAppCreds | null = null;
    if (workspaceId && input.media?.mediaType === "audio") {
      waCreds = await resolveWhatsAppCreds(workspaceId);
    }

    if (
      input.media?.mediaType === "audio" &&
      !input.media.mediaId.startsWith("asset:") &&
      !/^https?:\/\//i.test(input.media.mediaId) &&
      workspaceId &&
      waCreds?.provider === "meta"
    ) {
      try {
        const aiConfig = await resolveAiConfig();
        const transcriptionProvider = aiConfig.provider;
        if (transcriptionProvider !== "openai" && transcriptionProvider !== "gemini") {
          throw new Error(
            `تفريغ الرسائل الصوتية غير مدعوم لمزوّد الذكاء الاصطناعي "${transcriptionProvider}"`
          );
        }
        if (!aiConfig.apiKey) {
          throw new Error("مفتاح OPENAI_API_KEY غير مضبوط لتفريغ الرسائل الصوتية");
        }

        const audio = await downloadMetaAudio(input.media.mediaId, waCreds.token);
        const transcript = await transcribeAudio(audio.buffer, audio.mime, {
          apiKey: aiConfig.apiKey,
          provider: transcriptionProvider,
          model:
            transcriptionProvider === "openai"
              ? "whisper-1"
              : aiConfig.model,
        });
        const caption = text === "[رسالة صوتية]" ? "" : text.trim();
        text = [caption, transcript].filter(Boolean).join("\n\n");
      } catch (e) {
        console.error("[agent-engine] تعذّر تفريغ الرسالة الصوتية:", e);
      }
    }

    if (!agent) {
      console.warn(
        `[agent-engine] لا وكيل نشط في المساحة ${input.workspaceId} — تُخزن الرسالة يدوياً`
      );
      // لا يوجد وكيل نشط — نحفظ الرسالة في صندوق الوارد دون رد آلي حتى لا تضيع
      await storeInboundWithoutAgent({ ...input, text });
      return;
    }

    // بيانات واتساب من إعدادات مساحة العمل مع .env كبديل
    // ميتا أولاً، وإن كانت حقوله فارغة نستخدم UltraMsg
    waCreds ??= await resolveWhatsAppCreds(agent.workspaceId);

    await runPipeline({
      workspaceId: agent.workspaceId,
      agent,
      waPhone: input.waPhone,
      contactName: input.contactName,
      text,
      waMessageId: input.waMessageId,
      platform: "WHATSAPP",
      media: input.media,
      referral: input.referral,
      sendReply: (to, body) => sendWhatsAppMessage(to, body, waCreds),
      sendVoiceReply: async (to, audio) => {
        const mime = "audio/ogg; codecs=opus";
        const upload = await uploadWhatsAppMedia(
          { buffer: audio, mime, filename: "voice-reply.ogg" },
          waCreds
        );
        if (waCreds?.provider === "meta" && !upload.mediaId) {
          return {
            mediaId: null,
            result: {
              ok: false,
              messageId: null,
              error: upload.error ?? "فشل رفع الرد الصوتي",
            },
          };
        }
        const result = await sendWhatsAppMedia(
          to,
          {
            mediaId: upload.mediaId ?? "",
            mediaType: "audio",
            mime,
            filename: "voice-reply.ogg",
            buffer: audio,
            voice: true,
          },
          waCreds
        );
        return { result, mediaId: result.ok ? upload.mediaId : null };
      },
    });
  } catch (e) {
    // الخطأ يعود إلى عامل الطابور ليُعاد بأمان بدل فقدان الحدث.
    console.error("[agent-engine] خطأ في خط المعالجة:", e);
    throw e;
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
      sendReply: async () => ({ ok: true, messageId: null, error: null }),
    });
  } catch (e) {
    console.error("[agent-engine] خطأ في رسالة الويدجت:", e);
    return null;
  }
}
