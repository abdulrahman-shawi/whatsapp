import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveWhatsAppCreds,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";
import { generateReply, resolveAiConfig, type ChatMessage } from "@/lib/openai";
import { collectAgentKnowledge } from "@/lib/retrieval";
import { isContactStage } from "@/lib/contact-stages";

// أنواع خطوات سير العمل — تُخزن كعناصر داخل مصفوفة steps (JSON)
export type WorkflowStep =
  | { type: "SEND_MESSAGE"; body: string; templateId?: string }
  | { type: "ASSIGN"; userId: string } // "any" تعني أول عضو متاح في الفريق
  | { type: "SET_STAGE"; stage: string }
  | { type: "ADD_TAG"; tag: string }
  | { type: "AI_REPLY" }
  | { type: "STOP_AI" } // إيقاف الرد الآلي للمحادثة — تحكم بشري كامل
  | { type: "CLOSE" }
  | { type: "WAIT"; minutes: number }
  | { type: "WEBHOOK"; url: string };

// إعدادات المحفّز حسب نوعه
export type TriggerConfig =
  | { keywords: string[] } // KEYWORD
  | { phones: string[] } // FROM_NUMBERS
  | Record<string, never> // NEW_CONTACT
  | { fromStage?: string; toStage: string }; // STAGE_CHANGE

// سياق التشغيل: بيانات العميل والمحادثة التي أطلقت المحفّز
export type WorkflowContext = {
  workspaceId: string;
  contactId: string;
  waPhone: string;
  contactName: string | null;
  text: string; // آخر رسالة واردة (فارغة عند STAGE_CHANGE)
  conversationId?: string;
};

export const WORKFLOW_STEP_TYPES = [
  { type: "SEND_MESSAGE", label: "إرسال رسالة أو قالب" },
  { type: "ASSIGN", label: "إسناد المحادثة لموظف" },
  { type: "SET_STAGE", label: "تغيير حالة العميل" },
  { type: "ADD_TAG", label: "إضافة وسم" },
  { type: "AI_REPLY", label: "رد بالذكاء الاصطناعي" },
  { type: "STOP_AI", label: "إيقاف الرد الآلي" },
  { type: "CLOSE", label: "إغلاق المحادثة" },
  { type: "WAIT", label: "انتظار (تأخير)" },
  { type: "WEBHOOK", label: "Webhook خارجي" },
] as const;

// التحقق من بنية الخطوات قبل الحفظ — يعيد قائمة أخطاء فارغة عند الصحة
export function validateSteps(
  steps: WorkflowStep[],
  memberIds: string[]
): string[] {
  const errors: string[] = [];
  if (steps.length === 0) errors.push("أضف خطوة واحدة على الأقل");
  if (steps.length > 20) errors.push("الحد الأقصى ٢٠ خطوة لكل سير عمل");
  steps.forEach((step, i) => {
    const label = `الخطوة ${i + 1}`;
    switch (step.type) {
      case "SEND_MESSAGE":
        if (!step.body?.trim() && !step.templateId) {
          errors.push(`${label}: نص الرسالة أو قالب مطلوب`);
        }
        break;
      case "ASSIGN":
        if (step.userId !== "any" && !memberIds.includes(step.userId)) {
          errors.push(`${label}: الموظف المحدد ليس عضواً في الفريق`);
        }
        break;
      case "SET_STAGE":
        if (!isContactStage(step.stage)) {
          errors.push(`${label}: حالة العميل غير صالحة`);
        }
        break;
      case "ADD_TAG":
        if (!step.tag?.trim()) errors.push(`${label}: الوسم مطلوب`);
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
      default:
        break;
    }
  });
  return errors;
}

// استبدال متغيرات التخصيص في نص الرسالة
function personalize(body: string, ctx: WorkflowContext): string {
  return body
    .replaceAll("{{name}}", ctx.contactName ?? "عميلنا الكريم")
    .replaceAll("{{phone}}", ctx.waPhone);
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

// تنفيذ خطوة واحدة — أي خطأ يُرمى ليُسجَّل في سجل التشغيل
async function executeStep(step: WorkflowStep, ctx: WorkflowContext): Promise<string> {
  switch (step.type) {
    case "SEND_MESSAGE":
      await sendWorkflowMessage(ctx, step.body, step.templateId);
      return "أُرسلت الرسالة";
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
    case "AI_REPLY":
      await runAiReply(ctx);
      return "ردّ الذكاء الاصطناعي";
    case "CLOSE": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة لإغلاقها");
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { closedAt: new Date() },
      });
      return "أُغلقت المحادثة";
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
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Webhook ردّ بالحالة ${res.status}`);
      return "استُدعي الـ Webhook";
    }
    default:
      throw new Error(`نوع خطوة غير معروف: ${(step as WorkflowStep).type}`);
  }
}

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

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === "WAIT") {
      // توقف عند خطوة الانتظار: نحفظ الباقي ويستأنفه الكرون عند حلول الوقت
      const run = await prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          conversationId: ctx.conversationId ?? null,
          status: "WAITING",
          pendingSteps: steps.slice(i + 1),
          resumeAt: new Date(Date.now() + step.minutes * 60_000),
          logs: logs.join("\n"),
        },
      });
      console.log(
        `[workflows] "${workflow.name}" توقف عند الانتظار ${step.minutes}د — التشغيل ${run.id}`
      );
      return;
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
    };
    await executeWorkflow(run.workflow, ctx, run.pendingSteps, run.id);
  }
  return runs.length;
}
