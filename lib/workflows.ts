import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveWhatsAppCreds,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendWhatsAppMedia,
  sendWhatsAppLocationRequest,
  uploadWhatsAppMedia,
  mediaTypeForMime,
} from "@/lib/whatsapp";
import { generateReply, resolveAiConfig, type ChatMessage } from "@/lib/openai";
import { collectAgentKnowledge } from "@/lib/retrieval";
import { runKnowledgeQuery } from "@/lib/db-knowledge";
import { getIntegration } from "@/lib/settings";
import { isContactStage } from "@/lib/contact-stages";

// شرط التفرع في خطوة IF
export type IfCondition =
  | { kind: "STAGE"; stage: string } // حالة العميل تساوي…
  | { kind: "HAS_TAG"; tag: string } // العميل يحمل الوسم…
  | { kind: "TEXT_CONTAINS"; text: string } // آخر رسالة تحتوي النص…
  | { kind: "BUSINESS_HOURS" } // الوقت الحالي ضمن ساعات العمل المضبوطة
  | { kind: "DB_CONTAINS"; text: string }; // نتيجة QUERY_DB الأخيرة تحتوي النص…

// أنواع خطوات سير العمل — تُخزن كعناصر داخل مصفوفة steps (JSON)
// الخطوات متداخلة عبر IF: لكل شرط فرعان then/else وكل منهما قائمة خطوات
export type WorkflowStep =
  | { type: "SEND_MESSAGE"; body: string; templateId?: string }
  | { type: "SEND_MEDIA"; url: string; caption?: string } // صورة/فيديو/PDF من رابط مباشر
  | { type: "REQUEST_LOCATION"; prompt?: string } // طلب مشاركة الموقع (مزود ميتا فقط)
  | { type: "ASSIGN"; userId: string } // "any" تعني أول عضو متاح في الفريق
  | { type: "SET_AGENT"; agentId: string } // ربط المحادثة بوكيل ذكي محدد
  | { type: "SET_STAGE"; stage: string }
  | { type: "ADD_TAG"; tag: string }
  | { type: "REMOVE_TAG"; tag: string }
  | { type: "ADD_NOTE"; body: string } // ملاحظة داخلية لا تُرسل للعميل
  | { type: "AI_REPLY" }
  | { type: "STOP_AI" } // إيقاف الرد الآلي للمحادثة — تحكم بشري كامل
  | { type: "SEARCH_KNOWLEDGE" } // البحث في معرفة الوكيل وإرسال النتيجة
  | { type: "QUERY_DB"; sourceId: string } // استعلام مصدر DB — النتيجة في {{db}}
  | { type: "CLOSE" }
  | { type: "REOPEN" } // إعادة فتح محادثة مغلقة
  | { type: "WAIT"; minutes: number }
  | { type: "WEBHOOK"; url: string }
  | { type: "GOTO"; step: number } // قفز للأمام إلى رقم خطوة (1-based) في نفس المستوى
  | { type: "CREATE_BOOKING"; title: string; scheduledAt: string; notes?: string }
  | { type: "IF"; condition: IfCondition; then: WorkflowStep[]; else: WorkflowStep[] };

// إعدادات المحفّز حسب نوعه
export type TriggerConfig =
  | { keywords: string[] } // KEYWORD
  | { phones: string[] } // FROM_NUMBERS
  | Record<string, never> // NEW_CONTACT
  | { fromStage?: string; toStage: string } // STAGE_CHANGE
  | { hours: number }; // NO_REPLY — ساعات صمت العميل قبل التشغيل

// سياق التشغيل: بيانات العميل والمحادثة التي أطلقت المحفّز
export type WorkflowContext = {
  workspaceId: string;
  contactId: string;
  waPhone: string;
  contactName: string | null;
  text: string; // آخر رسالة واردة (فارغة عند STAGE_CHANGE وNO_REPLY)
  conversationId?: string;
  stage?: string; // تُملأ تلقائياً من جهة الاتصال عند بدء التشغيل
  tags?: string[]; // تُملأ تلقائياً — تدعم {{tags}} في الرسائل
  vars: Record<string, string>; // متغيرات بين الخطوات — مثل نتيجة {{db}}
};

export const WORKFLOW_STEP_TYPES = [
  { type: "SEND_MESSAGE", label: "إرسال رسالة أو قالب" },
  { type: "SEND_MEDIA", label: "إرسال وسائط (صورة/فيديو/PDF)" },
  { type: "REQUEST_LOCATION", label: "طلب موقع العميل" },
  { type: "ASSIGN", label: "إسناد المحادثة لموظف" },
  { type: "SET_AGENT", label: "ربط بوكيل ذكي" },
  { type: "SET_STAGE", label: "تغيير حالة العميل" },
  { type: "ADD_TAG", label: "إضافة وسم" },
  { type: "REMOVE_TAG", label: "إزالة وسم" },
  { type: "ADD_NOTE", label: "ملاحظة داخلية" },
  { type: "AI_REPLY", label: "رد بالذكاء الاصطناعي" },
  { type: "SEARCH_KNOWLEDGE", label: "بحث في المعرفة" },
  { type: "QUERY_DB", label: "استعلام قاعدة بيانات" },
  { type: "STOP_AI", label: "إيقاف الرد الآلي" },
  { type: "CLOSE", label: "إغلاق المحادثة" },
  { type: "REOPEN", label: "إعادة فتح المحادثة" },
  { type: "WAIT", label: "انتظار (تأخير)" },
  { type: "WEBHOOK", label: "Webhook خارجي" },
  { type: "CREATE_BOOKING", label: "إنشاء حجز موعد" },
  { type: "GOTO", label: "القفز إلى خطوة (للأمام)" },
  { type: "IF", label: "شرط (إذا)" },
] as const;

const MAX_TOTAL_STEPS = 30;
const MAX_DEPTH = 1; // تفرع واحد — لا IF متداخلة

// عدّ الخطوات شاملاً الفروع المتداخلة
function countSteps(steps: WorkflowStep[]): number {
  return steps.reduce((sum, s) => {
    if (s.type === "IF") return sum + 1 + countSteps(s.then) + countSteps(s.else);
    return sum + 1;
  }, 0);
}

// التحقق من شرط IF
function validateCondition(cond: IfCondition | undefined, label: string, errors: string[]) {
  if (!cond || typeof cond !== "object" || !("kind" in cond)) {
    errors.push(`${label}: الشرط مطلوب`);
    return;
  }
  switch (cond.kind) {
    case "STAGE":
      if (!isContactStage(cond.stage)) errors.push(`${label}: حالة العميل غير صالحة`);
      break;
    case "HAS_TAG":
      if (!cond.tag?.trim()) errors.push(`${label}: الوسم مطلوب`);
      break;
    case "TEXT_CONTAINS":
    case "DB_CONTAINS":
      if (!cond.text?.trim()) errors.push(`${label}: نص الشرط مطلوب`);
      break;
    case "BUSINESS_HOURS":
      break; // لا يحتاج إعداداً — يُضبط من صفحة التكاملات
    default:
      errors.push(`${label}: نوع شرط غير معروف`);
  }
}

// التحقق من بنية الخطوات قبل الحفظ — يعيد قائمة أخطاء فارغة عند الصحة
export function validateSteps(
  steps: WorkflowStep[],
  memberIds: string[]
): string[] {
  const errors: string[] = [];
  if (steps.length === 0) errors.push("أضف خطوة واحدة على الأقل");
  if (countSteps(steps) > MAX_TOTAL_STEPS) {
    errors.push(`الحد الأقصى ${MAX_TOTAL_STEPS} خطوة (شاملة فروع الشروط)`);
  }

  function walk(list: WorkflowStep[], depth: number, prefix: string) {
    list.forEach((step, i) => {
      const label = `${prefix}${i + 1}`;
      switch (step.type) {
        case "SEND_MESSAGE":
          if (!step.body?.trim() && !step.templateId) {
            errors.push(`${label}: نص الرسالة أو قالب مطلوب`);
          }
          break;
        case "SEND_MEDIA":
          if (!/^https?:\/\//.test(step.url ?? "")) {
            errors.push(`${label}: رابط الوسائط يجب أن يبدأ بـ http(s)://`);
          }
          break;
        case "ASSIGN":
          if (step.userId !== "any" && !memberIds.includes(step.userId)) {
            errors.push(`${label}: الموظف المحدد ليس عضواً في الفريق`);
          }
          break;
        case "SET_AGENT":
          if (!step.agentId?.trim()) errors.push(`${label}: اختر الوكيل`);
          break;
        case "SET_STAGE":
          if (!isContactStage(step.stage)) {
            errors.push(`${label}: حالة العميل غير صالحة`);
          }
          break;
        case "ADD_TAG":
        case "REMOVE_TAG":
          if (!step.tag?.trim()) errors.push(`${label}: الوسم مطلوب`);
          break;
        case "ADD_NOTE":
          if (!step.body?.trim()) errors.push(`${label}: نص الملاحظة مطلوب`);
          break;
        case "QUERY_DB":
          if (!step.sourceId?.trim()) errors.push(`${label}: اختر مصدر قاعدة البيانات`);
          break;
        case "CREATE_BOOKING":
          if (!step.title?.trim()) errors.push(`${label}: عنوان الحجز مطلوب`);
          if (!step.scheduledAt || isNaN(Date.parse(step.scheduledAt))) {
            errors.push(`${label}: موعد الحجز غير صالح`);
          }
          break;
        case "GOTO":
          if (
            depth > 0 ||
            !Number.isInteger(step.step) ||
            step.step < 1 ||
            step.step > steps.length
          ) {
            errors.push(
              `${label}: القفز متاح في المستوى الرئيسي فقط وإلى خطوة بين 1 و${steps.length} (للأمام)`
            );
          }
          break;
        case "WAIT":
          if (
            typeof step.minutes !== "number" ||
            step.minutes < 1 ||
            step.minutes > 7 * 24 * 60
          ) {
            errors.push(`${label}: مدة الانتظار بين دقيقة وأسبوع`);
          }
          break;
        case "WEBHOOK":
          if (!/^https?:\/\//.test(step.url ?? "")) {
            errors.push(`${label}: رابط Webhook يجب أن يبدأ بـ http(s)://`);
          }
          break;
        case "IF": {
          if (depth >= MAX_DEPTH) {
            errors.push(`${label}: لا يمكن تداخل شرط داخل شرط`);
            break;
          }
          validateCondition(step.condition, label, errors);
          if (!Array.isArray(step.then) || !Array.isArray(step.else)) {
            errors.push(`${label}: فروعا الشرط (نعم/لا) مطلوبان`);
            break;
          }
          if (step.then.length === 0 && step.else.length === 0) {
            errors.push(`${label}: أضف خطوة في أحد الفرعين على الأقل`);
          }
          walk(step.then, depth + 1, `${label}←نعم:`);
          walk(step.else, depth + 1, `${label}←لا:`);
          break;
        }
        default:
          break;
      }
    });
  }

  walk(steps, 0, "الخطوة ");
  return errors;
}

// استبدال متغيرات التخصيص في نص الرسالة
function personalize(body: string, ctx: WorkflowContext): string {
  return body
    .replaceAll("{{name}}", ctx.contactName ?? "عميلنا الكريم")
    .replaceAll("{{phone}}", ctx.waPhone)
    .replaceAll("{{stage}}", ctx.stage ?? "")
    .replaceAll("{{tags}}", (ctx.tags ?? []).join("، "))
    .replaceAll("{{db}}", ctx.vars["db"] ?? "");
}

// إرسال رسالة واتساب (نص أو قالب) وتخزينها في المحادثة
async function sendWorkflowMessage(
  ctx: WorkflowContext,
  body: string,
  templateId?: string
): Promise<void> {
  const creds = await resolveWhatsAppCreds(ctx.workspaceId);
  const sent = templateId
    ? await (async () => {
        const template = await prisma.template.findFirst({
          where: { id: templateId, workspaceId: ctx.workspaceId },
        });
        if (!template) return false;
        return sendWhatsAppTemplate(
          ctx.waPhone,
          { name: template.name, language: template.language, params: [] },
          creds
        );
      })()
    : await sendWhatsAppMessage(ctx.waPhone, personalize(body, ctx), creds);

  if (ctx.conversationId) {
    await prisma.message.create({
      data: {
        conversationId: ctx.conversationId,
        direction: "OUTBOUND",
        senderType: "HUMAN",
        body: templateId ? "[قالب] " + personalize(body, ctx) : personalize(body, ctx),
      },
    });
    await prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { lastMessageAt: new Date() },
    });
  }
  if (!sent) throw new Error("فشل إرسال الرسالة عبر مزود واتساب");
}

// تخمين نوع MIME من امتداد الرابط عند غياب Content-Type
function mimeFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
  };
  return map[ext] ?? "application/octet-stream";
}

// إرسال وسائط من رابط مباشر: تنزيل ثم إرسال عبر المزود (رفع مسبق لميتا / base64 لـ UltraMsg)
async function sendWorkflowMedia(
  ctx: WorkflowContext,
  url: string,
  caption?: string
): Promise<void> {
  const creds = await resolveWhatsAppCreds(ctx.workspaceId);
  if (!creds) throw new Error("لا يوجد مزود واتساب مُعدّ");

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`تعذّر تنزيل الوسائط — الحالة ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error("الملف المحمّل فارغ");
  if (buffer.length > 16 * 1024 * 1024) throw new Error("حجم الملف يتجاوز 16MB");

  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || mimeFromUrl(url);
  const filename = decodeURIComponent(url.split("?")[0].split("/").pop() || "ملف");
  const mediaType = mediaTypeForMime(mime);

  let sent: boolean;
  if (creds.provider === "meta") {
    const mediaId = await uploadWhatsAppMedia({ buffer, mime, filename }, creds);
    if (!mediaId) throw new Error("فشل رفع الوسائط إلى ميتا");
    sent = await sendWhatsAppMedia(
      ctx.waPhone,
      { mediaId, mediaType, mime, filename, caption },
      creds
    );
  } else {
    sent = await sendWhatsAppMedia(
      ctx.waPhone,
      { mediaId: "", mediaType, mime, filename, caption, buffer },
      creds
    );
  }
  if (!sent) throw new Error("فشل إرسال الوسائط عبر المزود");

  if (ctx.conversationId) {
    await prisma.message.create({
      data: {
        conversationId: ctx.conversationId,
        direction: "OUTBOUND",
        senderType: "HUMAN",
        body: caption ?? "[وسائط]",
        mediaMime: mime,
        mediaType,
      },
    });
    await prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { lastMessageAt: new Date() },
    });
  }
}

// هل الوقت الحالي ضمن ساعات العمل؟ تُضبط من صفحة التكاملات
// BUSINESS_HOURS_START / BUSINESS_HOURS_END (ساعة 0-23) / BUSINESS_HOURS_DAYS ("0,1,2…" — فارغ = كل الأيام)
// عند عدم الضبط: لا قيد (true)
async function isBusinessHours(workspaceId: string): Promise<boolean> {
  const [start, end, days] = await Promise.all([
    getIntegration(workspaceId, "BUSINESS_HOURS_START"),
    getIntegration(workspaceId, "BUSINESS_HOURS_END"),
    getIntegration(workspaceId, "BUSINESS_HOURS_DAYS"),
  ]);
  if (!start && !end) return true; // غير مضبوط — بلا قيد

  const now = new Date();
  if (days) {
    const allowed = days
      .split(",")
      .map((d) => parseInt(d.trim(), 10))
      .filter((n) => !isNaN(n));
    if (allowed.length > 0 && !allowed.includes(now.getDay())) return false;
  }
  const s = parseInt(start ?? "9", 10);
  const e = parseInt(end ?? "17", 10);
  const h = now.getHours();
  return h >= s && h < e;
}

// تقييم شرط IF — يقرأ حالة العميل والوسوم وقت التنفيذ
async function evaluateCondition(
  cond: IfCondition,
  ctx: WorkflowContext
): Promise<boolean> {
  switch (cond.kind) {
    case "STAGE": {
      const contact = await prisma.contact.findUnique({
        where: { id: ctx.contactId },
        select: { stage: true },
      });
      return contact?.stage === cond.stage;
    }
    case "HAS_TAG": {
      const contact = await prisma.contact.findUnique({
        where: { id: ctx.contactId },
        select: { tags: true },
      });
      return (contact?.tags ?? []).includes(cond.tag.trim());
    }
    case "TEXT_CONTAINS":
      return ctx.text.toLowerCase().includes(cond.text.trim().toLowerCase());
    case "BUSINESS_HOURS":
      return isBusinessHours(ctx.workspaceId);
    case "DB_CONTAINS":
      return (ctx.vars["db"] ?? "").toLowerCase().includes(cond.text.trim().toLowerCase());
    default:
      return false;
  }
}

// رد ذكاء اصطناعي داخل سير العمل — بمعرفة الوكيل المرتبط بالمحادثة
async function runAiReply(ctx: WorkflowContext): Promise<void> {
  if (!ctx.conversationId) throw new Error("لا توجد محادثة مرتبطة");
  const conversation = await prisma.conversation.findFirst({
    where: { id: ctx.conversationId },
    include: { agent: { include: { knowledgeSources: true } } },
  });
  if (!conversation?.agent) throw new Error("لا يوجد وكيل مرتبط بالمحادثة");

  const history: ChatMessage[] = (
    await prisma.message.findMany({
      where: { conversationId: conversation.id, isNote: false },
      orderBy: { createdAt: "desc" },
      take: 10,
    })
  )
    .reverse()
    .map((m) => ({
      role: m.direction === "INBOUND" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    }));

  const knowledge = await collectAgentKnowledge(
    conversation.agent.knowledgeSources,
    ctx.text,
    ctx.waPhone
  );
  const aiConfig = await resolveAiConfig(ctx.workspaceId);
  const aiReply = await generateReply(
    history,
    conversation.agent.systemPrompt,
    knowledge,
    aiConfig
  );
  if (!aiReply) throw new Error("تعذّر توليد رد الذكاء الاصطناعي");

  await sendWorkflowMessage(ctx, aiReply.content);

  // احتساب التوكنات المستهلكة في رصيد الباقة الشهري
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageRecord.upsert({
    where: { workspaceId_month: { workspaceId: ctx.workspaceId, month } },
    update: { tokensUsed: { increment: aiReply.usage.totalTokens } },
    create: {
      workspaceId: ctx.workspaceId,
      month,
      tokensUsed: aiReply.usage.totalTokens,
    },
  });
}

// جلب محادثة مع وكيلها ومصادر معرفته — يخدم SEARCH_KNOWLEDGE وQUERY_DB
async function conversationWithAgent(conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId },
    include: { agent: { include: { knowledgeSources: true } } },
  });
}

// تنفيذ خطوة واحدة — أي خطأ يُرمى ليُسجَّل في سجل التشغيل
async function executeStep(step: WorkflowStep, ctx: WorkflowContext): Promise<string> {
  switch (step.type) {
    case "SEND_MESSAGE":
      await sendWorkflowMessage(ctx, step.body, step.templateId);
      return "أُرسلت الرسالة";
    case "SEND_MEDIA":
      await sendWorkflowMedia(ctx, step.url, step.caption);
      return "أُرسلت الوسائط";
    case "REQUEST_LOCATION": {
      const creds = await resolveWhatsAppCreds(ctx.workspaceId);
      if (!creds) throw new Error("لا يوجد مزود واتساب مُعدّ");
      if (creds.provider !== "meta") {
        throw new Error("طلب الموقع متاح مع مزود ميتا فقط");
      }
      const sent = await sendWhatsAppLocationRequest(
        ctx.waPhone,
        personalize(step.prompt ?? "يرجى مشاركة موقعك لإتمام الطلب", ctx),
        creds
      );
      if (!sent) throw new Error("فشل إرسال طلب الموقع");
      if (ctx.conversationId) {
        await prisma.message.create({
          data: {
            conversationId: ctx.conversationId,
            direction: "OUTBOUND",
            senderType: "HUMAN",
            body: "[طلب موقع] " + (step.prompt ?? ""),
          },
        });
      }
      return "أُرسل طلب الموقع";
    }
    case "ASSIGN": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة لإسنادها");
      let userId = step.userId;
      if (userId === "any") {
        const member = await prisma.workspaceMember.findFirst({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { role: "asc" }, // OWNER أولاً
        });
        if (!member) throw new Error("لا يوجد أعضاء في الفريق");
        userId = member.userId;
      }
      const membership = await prisma.workspaceMember.findFirst({
        where: { userId, workspaceId: ctx.workspaceId },
      });
      if (!membership) throw new Error("الموظف ليس عضواً في الفريق");
      await prisma.conversationAssignee.deleteMany({
        where: { conversationId: ctx.conversationId },
      });
      await prisma.conversationAssignee.create({
        data: { conversationId: ctx.conversationId, userId },
      });
      return "أُسندت المحادثة";
    }
    case "SET_AGENT": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة");
      const agent = await prisma.agent.findFirst({
        where: { id: step.agentId, workspaceId: ctx.workspaceId },
      });
      if (!agent) throw new Error("الوكيل غير موجود في مساحة العمل");
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { agentId: agent.id },
      });
      return `رُبطت المحادثة بالوكيل "${agent.name}"`;
    }
    case "SET_STAGE":
      await prisma.contact.update({
        where: { id: ctx.contactId },
        data: { stage: step.stage as never },
      });
      return "حُدِّثت حالة العميل";
    case "ADD_TAG": {
      const contact = await prisma.contact.findUnique({
        where: { id: ctx.contactId },
      });
      const tag = step.tag.trim();
      if (contact && !contact.tags.includes(tag)) {
        await prisma.contact.update({
          where: { id: ctx.contactId },
          data: { tags: { push: tag } },
        });
      }
      return "أُضيف الوسم";
    }
    case "REMOVE_TAG": {
      const contact = await prisma.contact.findUnique({
        where: { id: ctx.contactId },
      });
      const tag = step.tag.trim();
      if (contact?.tags.includes(tag)) {
        await prisma.contact.update({
          where: { id: ctx.contactId },
          data: { tags: contact.tags.filter((t) => t !== tag) },
        });
      }
      return "أُزيل الوسم";
    }
    case "ADD_NOTE": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة للملاحظة");
      await prisma.message.create({
        data: {
          conversationId: ctx.conversationId,
          direction: "OUTBOUND",
          senderType: "HUMAN",
          body: personalize(step.body, ctx),
          isNote: true,
        },
      });
      return "أُضيفت ملاحظة داخلية";
    }
    case "AI_REPLY":
      await runAiReply(ctx);
      return "ردّ الذكاء الاصطناعي";
    case "SEARCH_KNOWLEDGE": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة مرتبطة");
      const conversation = await conversationWithAgent(ctx.conversationId);
      if (!conversation?.agent) throw new Error("لا يوجد وكيل مرتبط بالمحادثة");
      const knowledge = await collectAgentKnowledge(
        conversation.agent.knowledgeSources,
        ctx.text || "معلومات",
        ctx.waPhone
      );
      if (knowledge.length === 0) return "لا توجد معرفة مطابقة — تُخطّى الإرسال";
      const body = knowledge.join("\n\n").slice(0, 1500);
      await sendWorkflowMessage(ctx, body);
      return "أُرسلت نتيجة البحث في المعرفة";
    }
    case "QUERY_DB": {
      const source = await prisma.knowledgeSource.findFirst({
        where: {
          id: step.sourceId,
          type: "DB",
          agent: { workspaceId: ctx.workspaceId },
        },
      });
      if (!source) throw new Error("مصدر قاعدة البيانات غير موجود");
      const result = await runKnowledgeQuery(source, ctx.waPhone);
      if (!result.ok) throw new Error(`فشل الاستعلام: ${result.error}`);
      ctx.vars["db"] = result.text;
      return result.rowCount > 0
        ? `استعلام ناجح — ${result.rowCount} صف في {{db}}`
        : "الاستعلام ناجع بلا نتائج — {{db}} فارغ";
    }
    case "CLOSE": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة لإغلاقها");
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { closedAt: new Date() },
      });
      return "أُغلقت المحادثة";
    }
    case "REOPEN": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة");
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { closedAt: null },
      });
      return "أُعيد فتح المحادثة";
    }
    case "STOP_AI": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة");
      // تحويل للتحكم اليدوي — لا يردّ الوكيل الآلي على رسائل هذه المحادثة بعدها
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: "MANUAL" },
      });
      return "أُوقف الرد الآلي (تحكم بشري)";
    }
    case "WEBHOOK": {
      const res = await fetch(step.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "workflow",
          contact: { name: ctx.contactName, phone: ctx.waPhone },
          text: ctx.text,
          vars: ctx.vars,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Webhook ردّ بالحالة ${res.status}`);
      return "استُدعي الـ Webhook";
    }
    case "CREATE_BOOKING": {
      const scheduledAt = new Date(step.scheduledAt);
      if (isNaN(scheduledAt.getTime())) throw new Error("موعد الحجز غير صالح");
      await prisma.booking.create({
        data: {
          workspaceId: ctx.workspaceId,
          contactId: ctx.contactId,
          title: personalize(step.title, ctx),
          scheduledAt,
          notes: step.notes ? personalize(step.notes, ctx) : null,
        },
      });
      return "أُنشئ الحجز";
    }
    default:
      throw new Error(`نوع خطوة غير معروف: ${(step as WorkflowStep).type}`);
  }
}

// إطار تنفيذ: قائمة خطوات + موضع المؤشر — تداخله يمثل فروع IF
type Frame = { steps: WorkflowStep[]; index: number };

// تنفيذ سير عمل كامل (أو استئناف خطوات متبقية) مع تسجيل النتيجة
export async function executeWorkflow(
  workflow: { id: string; name: string; steps: unknown },
  ctx: WorkflowContext,
  pendingSteps?: unknown,
  runId?: string
): Promise<void> {
  const steps = (pendingSteps ?? workflow.steps) as WorkflowStep[];
  const logs: string[] = [];
  let failed = false;

  // ملء حالة العميل والوسوم مرة واحدة — تدعم الشروط ومتغيرات الرسائل
  if (ctx.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: ctx.contactId },
      select: { stage: true, tags: true },
    });
    if (contact) {
      ctx.stage = contact.stage;
      ctx.tags = contact.tags;
    }
  }

  const stack: Frame[] = [{ steps, index: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.steps.length) {
      stack.pop();
      continue;
    }
    const step = frame.steps[frame.index++];

    if (step.type === "WAIT") {
      // تجميع كل ما تبقى من البرنامج (الأعمق أولاً) كقائمة واحدة مستأنفة
      const remaining: WorkflowStep[] = [];
      for (let f = stack.length - 1; f >= 0; f--) {
        remaining.push(...stack[f].steps.slice(stack[f].index));
      }
      const runData = {
        status: "WAITING",
        pendingSteps: remaining as Prisma.InputJsonValue,
        resumeAt: new Date(Date.now() + step.minutes * 60_000),
        logs: logs.join("\n"),
      };
      if (runId) {
        await prisma.workflowRun.update({ where: { id: runId }, data: runData });
      } else {
        await prisma.workflowRun.create({
          data: {
            workflowId: workflow.id,
            conversationId: ctx.conversationId ?? null,
            ...runData,
          },
        });
      }
      console.log(
        `[workflows] "${workflow.name}" توقف عند الانتظار ${step.minutes}د — التشغيل ${runId ?? "جديد"}`
      );
      return;
    }

    if (step.type === "IF") {
      const passed = await evaluateCondition(step.condition, ctx).catch(() => false);
      const branch = passed ? step.then : step.else;
      logs.push(`↳ IF (${step.condition.kind}) → ${passed ? "نعم" : "لا"}`);
      if (branch.length > 0) stack.push({ steps: branch, index: 0 });
      continue;
    }

    if (step.type === "GOTO") {
      // قفز للأمام فقط وضمن نفس المستوى — يمنع الحلقات اللانهائية
      if (step.step >= frame.index + 1 && step.step <= frame.steps.length) {
        frame.index = step.step - 1;
        logs.push(`↷ GOTO → الخطوة ${step.step}`);
      } else {
        failed = true;
        logs.push(`✗ GOTO: الخطوة ${step.step} ليست للأمام أو خارج النطاق`);
      }
      continue;
    }

    try {
      const result = await executeStep(step, ctx);
      logs.push(`✓ ${step.type}: ${result}`);
    } catch (e) {
      failed = true;
      const message = e instanceof Error ? e.message : "خطأ غير معروف";
      logs.push(`✗ ${step.type}: ${message}`);
    }
  }

  const data = {
    status: failed ? "FAILED" : "SUCCESS",
    pendingSteps: Prisma.DbNull,
    resumeAt: null,
    logs: logs.join("\n"),
  };
  if (runId) {
    await prisma.workflowRun.update({ where: { id: runId }, data });
  } else {
    await prisma.workflowRun.create({
      data: { workflowId: workflow.id, conversationId: ctx.conversationId ?? null, ...data },
    });
  }
}

// مطابقة سير عمل واحد مع حدث محفّز — يعيد true عند تحقق الشروط
function workflowMatches(
  workflow: { trigger: string; triggerConfig: unknown },
  trigger: string,
  config: TriggerConfig,
  ctx: WorkflowContext
): boolean {
  if (workflow.trigger !== trigger) return false;
  const tc = (workflow.triggerConfig ?? {}) as Record<string, unknown>;
  switch (trigger) {
    case "KEYWORD": {
      const keywords = Array.isArray(tc.keywords) ? tc.keywords : [];
      const text = ctx.text.toLowerCase();
      return keywords.some(
        (k) => typeof k === "string" && k.trim() && text.includes(k.trim().toLowerCase())
      );
    }
    case "FROM_NUMBERS": {
      const phones = Array.isArray(tc.phones) ? tc.phones : [];
      return phones.some(
        (p) => typeof p === "string" && p.trim() && ctx.waPhone.includes(p.trim())
      );
    }
    case "NEW_CONTACT":
      return true;
    case "STAGE_CHANGE": {
      const to = tc.toStage;
      const from = tc.fromStage;
      const change = config as { fromStage?: string; toStage: string };
      if (to && to !== change.toStage) return false;
      if (from && from !== (change.fromStage ?? "")) return false;
      return true;
    }
    default:
      return false;
  }
}

// نقطة الدخول: مطابقة سير العمل النشطة وتشغيلها لحدث ما
// نستخدمها في مسار الرسائل الواردة وفي تغيير حالة العميل
export async function triggerWorkflows(
  workspaceId: string,
  trigger: "KEYWORD" | "FROM_NUMBERS" | "NEW_CONTACT" | "STAGE_CHANGE",
  config: TriggerConfig,
  ctx: WorkflowContext
): Promise<void> {
  const workflows = await prisma.workflow.findMany({
    where: { workspaceId, isActive: true, trigger },
  });
  for (const workflow of workflows) {
    if (!workflowMatches(workflow, trigger, config, ctx)) continue;
    // التشغيل متسلسل ومنتظر — خطوة "إيقاف الرد الآلي" يجب أن تسبق قرار الوكيل
    try {
      await executeWorkflow(workflow, ctx);
    } catch (e) {
      console.error(`[workflows] فشل تشغيل "${workflow.name}":`, e);
    }
  }
}

// فحص محفّز "لا رد" — يستدعيه الكرون كل ٥ دقائق
// يشغّل سير العمل للمحادثات التي صمت عميلها أكثر من المدة المحددة
export async function runNoReplyWorkflows(): Promise<number> {
  const workflows = await prisma.workflow.findMany({
    where: { isActive: true, trigger: "NO_REPLY" },
  });
  let fired = 0;

  for (const workflow of workflows) {
    const tc = (workflow.triggerConfig ?? {}) as { hours?: number };
    const hours =
      typeof tc.hours === "number" && tc.hours >= 1 ? Math.min(tc.hours, 24 * 30) : 24;
    const cutoff = new Date(Date.now() - hours * 3_600_000);

    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId: workflow.workspaceId,
        closedAt: null,
        isArchived: false,
        lastMessageAt: { lte: cutoff },
      },
      include: { contact: true },
      take: 50,
    });

    for (const conv of conversations) {
      // آخر رسالة حقيقية (ليست ملاحظة) يجب أن تكون واردة من العميل
      const lastMsg = await prisma.message.findFirst({
        where: { conversationId: conv.id, isNote: false },
        orderBy: { createdAt: "desc" },
      });
      if (!lastMsg || lastMsg.direction !== "INBOUND") continue;

      // لا يعيد الإطلاق إن شُغّل هذا السير لهذه المحادثة بعد آخر رسالة من العميل
      const already = await prisma.workflowRun.findFirst({
        where: {
          workflowId: workflow.id,
          conversationId: conv.id,
          status: { in: ["SUCCESS", "WAITING"] },
          createdAt: { gte: lastMsg.createdAt },
        },
        select: { id: true },
      });
      if (already) continue;

      const ctx: WorkflowContext = {
        workspaceId: workflow.workspaceId,
        contactId: conv.contactId,
        waPhone: conv.contact.waPhone,
        contactName: conv.contact.name,
        text: "",
        conversationId: conv.id,
        vars: {},
      };
      try {
        await executeWorkflow(workflow, ctx);
        fired++;
      } catch (e) {
        console.error(`[workflows] فشل تشغيل NO_REPLY "${workflow.name}":`, e);
      }
    }
  }
  return fired;
}

// استئناف التشغيلات المتوقفة عند خطوة انتظار — يستدعيها كرون كل ٥ دقائق
export async function resumeWaitingWorkflowRuns(): Promise<number> {
  const runs = await prisma.workflowRun.findMany({
    where: { status: "WAITING", resumeAt: { lte: new Date() } },
    include: {
      workflow: { select: { id: true, name: true, steps: true, workspaceId: true } },
    },
    take: 50,
  });
  for (const run of runs) {
    const conversation = run.conversationId
      ? await prisma.conversation.findUnique({
          where: { id: run.conversationId },
          include: { contact: true },
        })
      : null;
    const ctx: WorkflowContext = {
      workspaceId: run.workflow.workspaceId,
      contactId: conversation?.contactId ?? "",
      waPhone: conversation?.contact.waPhone ?? "",
      contactName: conversation?.contact.name ?? null,
      text: "",
      conversationId: run.conversationId ?? undefined,
      vars: {},
    };
    await executeWorkflow(run.workflow, ctx, run.pendingSteps, run.id);
  }
  return runs.length;
}
