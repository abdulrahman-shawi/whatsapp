import { Prisma, type ContactStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyMembers } from "@/lib/notify";
import type { ToolCall } from "@/lib/openai";
import { triggerWorkflows } from "@/lib/workflows";

// تنفيذ أدوات مهارات الوكيل على قاعدة البيانات:
// كل أداة تتحقق أن جهة الاتصال/المحادثة تتبع مساحة عمل المستخدم،
// وتعيد نص نتيجة مختصراً يُحقن في المحادثة كرسالة tool للنموذج.

export type AgentToolContext = {
  workspaceId: string;
  contactId: string;
  conversationId: string;
};

export type ToolResultMessage = { toolCallId: string; content: string };

const STAGE_LABELS: Record<string, string> = {
  NEW: "عملية بيع جديدة",
  CONTACTING: "جاري التواصل",
  INTERESTED: "مهتم",
  NEGOTIATING: "يفاوض",
  CUSTOMER: "عميل مشترٍ",
  LOST: "ضائع",
};

function parseArgs(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const items = v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return items.length > 0 ? items : undefined;
}

// يتحقق من ملكية جهة الاتصال لمساحة العمل ويعيدها أو null
async function ownedContact(ctx: AgentToolContext) {
  return prisma.contact.findFirst({
    where: { id: ctx.contactId, workspaceId: ctx.workspaceId },
  });
}

async function updateContact(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const contact = await ownedContact(ctx);
  if (!contact) return "تعذّر التحديث: جهة الاتصال غير موجودة";

  const email = str(args.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "تعذّر التحديث: البريد الإلكتروني غير صالح";
  }

  const tags = strArray(args.tags);
  const data: Record<string, unknown> = {};
  const name = str(args.name);
  if (name) data.name = name;
  if (email) data.email = email;
  const phone = str(args.phone);
  if (phone) data.waPhone = phone;
  if (tags) data.tags = [...new Set([...contact.tags, ...tags])].slice(0, 20);

  if (Object.keys(data).length === 0) return "لا شيء لتحديثه";

  const updatedContact = await prisma.contact.update({ where: { id: contact.id }, data });
  const workflowContext = {
    workspaceId: ctx.workspaceId,
    contactId: contact.id,
    waPhone: updatedContact.waPhone,
    contactName: updatedContact.name,
    text: "",
    conversationId: ctx.conversationId,
    stage: updatedContact.stage,
    tags: updatedContact.tags,
    vars: {},
  };
  for (const [field, value, previous] of [
    ["name", updatedContact.name, contact.name],
    ["email", updatedContact.email, contact.email],
  ] as const) {
    if (value !== previous) {
      void triggerWorkflows(
        ctx.workspaceId,
        "CONTACT_FIELD_UPDATED",
        { field },
        { ...workflowContext, vars: { field, value: value ?? "" } }
      ).catch((error) =>
        console.error(`[agent-tools] فشل تشغيل محفّز تحديث الحقل "${field}":`, error)
      );
    }
  }
  for (const tag of updatedContact.tags.filter((item) => !contact.tags.includes(item))) {
    void triggerWorkflows(
      ctx.workspaceId,
      "CONTACT_TAG_UPDATED",
      { changedTag: tag },
      { ...workflowContext, vars: { tag } }
    ).catch((error) =>
      console.error(`[agent-tools] فشل تشغيل محفّز تحديث الوسم "${tag}":`, error)
    );
  }
  const changed = [
    name ? "الاسم" : null,
    email ? "البريد" : null,
    phone ? "الهاتف" : null,
    tags ? "الوسوم" : null,
  ].filter(Boolean);
  return `تم تحديث بيانات العميل (${changed.join("، ")})`;
}

async function updateContactStage(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const stage = str(args.stage);
  if (!stage || !(stage in STAGE_LABELS)) {
    return "تعذّر التحديث: المرحلة غير معروفة";
  }
  const contact = await ownedContact(ctx);
  if (!contact) return "تعذّر التحديث: جهة الاتصال غير موجودة";

  const stageValue = stage as ContactStage;
  await prisma.contact.update({ where: { id: contact.id }, data: { stage: stageValue } });
  // سجل المرحلة يغذي تقارير التحويل — المصدر ai لأن التغيير أتوماتيكي
  await prisma.contactStageHistory.create({
    data: { contactId: contact.id, stage: stageValue, source: "ai" },
  });
  if (contact.stage !== stageValue) {
    void triggerWorkflows(
      ctx.workspaceId,
      "STAGE_CHANGE",
      { fromStage: contact.stage, toStage: stageValue },
      {
        workspaceId: ctx.workspaceId,
        contactId: contact.id,
        waPhone: contact.waPhone,
        contactName: contact.name,
        text: "",
        conversationId: ctx.conversationId,
        vars: {},
      }
    ).catch((error) =>
      console.error("[agent-tools] فشل تشغيل محفّز تحديث المرحلة:", error)
    );
  }
  return `تم تحديث مرحلة العميل إلى: ${STAGE_LABELS[stage]}`;
}

async function addNote(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const note = str(args.note);
  if (!note) return "لا شيء لتسجيله";
  const contact = await ownedContact(ctx);
  if (!contact) return "تعذّر التسجيل: جهة الاتصال غير موجودة";

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const existing = contact.notes?.trim();
  const combined = [existing, `[${stamp}] ${note}`].filter(Boolean).join("\n");
  // نحتفظ بأحدث الملاحظات عند تجاوز الحد
  const notes = combined.length > 5000 ? combined.slice(combined.length - 5000) : combined;
  await prisma.contact.update({ where: { id: contact.id }, data: { notes } });
  if (contact.notes !== notes) {
    void triggerWorkflows(
      ctx.workspaceId,
      "CONTACT_FIELD_UPDATED",
      { field: "notes" },
      {
        workspaceId: ctx.workspaceId,
        contactId: contact.id,
        waPhone: contact.waPhone,
        contactName: contact.name,
        text: "",
        conversationId: ctx.conversationId,
        vars: { field: "notes", value: notes },
      }
    ).catch((error) =>
      console.error("[agent-tools] فشل تشغيل محفّز تحديث الملاحظات:", error)
    );
  }
  return "تمت إضافة الملاحظة إلى جهة الاتصال";
}

async function requestHumanHandoff(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: ctx.conversationId, workspaceId: ctx.workspaceId },
  });
  if (!conversation) return "تعذّر التسليم: المحادثة غير موجودة";

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: "HANDED_OFF" },
  });
  const reason = str(args.reason);
  // إشعار الفريق بالتسليم — لا يوقف المعالجة عند فشله
  notifyMembers({
    workspaceId: ctx.workspaceId,
    type: "SYSTEM",
    title: "طلب تسليم من الوكيل",
    body: reason ? `الوكيل طلب تسليم المحادثة: ${reason}` : "الوكيل طلب تسليم المحادثة إلى موظف",
    link: `/inbox?c=${conversation.id}`,
  }).catch((e) => console.error("[agent-tools] تعذّر إشعار الفريق بالتسليم:", e));
  return "تم تسليم المحادثة إلى الفريق";
}

async function closeConversation(
  ctx: AgentToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: ctx.conversationId, workspaceId: ctx.workspaceId },
  });
  if (!conversation) return "تعذّر الإغلاق: المحادثة غير موجودة";
  if (conversation.closedAt) return "المحادثة مغلقة أصلاً";

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      closedAt: new Date(),
      csatPending: true,
      csatAskedAt: new Date(),
      isCritical: false,
      criticalAt: null,
    },
  });
  // جدولة سؤال تقييم الرضا بعد دقيقتين — بنفس نمط الإغلاق اليدوي
  await prisma.scheduledMessage.create({
    data: {
      workspaceId: ctx.workspaceId,
      conversationId: conversation.id,
      body: "شكراً لتواصلك معنا 🌟\nكيف كانت تجربتك؟ قيّم خدمتنا بالرد برقم من ١ إلى ٥",
      sendAt: new Date(Date.now() + 2 * 60 * 1000),
    },
  });
  const contact = await prisma.contact.findUnique({
    where: { id: conversation.contactId },
  });
  if (contact) {
    void triggerWorkflows(
      ctx.workspaceId,
      "CONVERSATION_ENDED",
      {},
      {
        workspaceId: ctx.workspaceId,
        contactId: contact.id,
        waPhone: contact.waPhone,
        contactName: contact.name,
        text: "",
        conversationId: conversation.id,
        stage: contact.stage,
        tags: contact.tags,
        vars: {},
      }
    ).catch((error) =>
      console.error("[agent-tools] فشل تشغيل محفّز إغلاق المحادثة:", error)
    );
  }
  const summary = str(args.summary);
  return summary ? `تم إغلاق المحادثة (${summary})` : "تم إغلاق المحادثة";
}

const EXECUTORS: Record<
  string,
  (ctx: AgentToolContext, args: Record<string, unknown>) => Promise<string>
> = {
  update_contact: updateContact,
  update_contact_stage: updateContactStage,
  add_note: addNote,
  request_human_handoff: requestHumanHandoff,
  close_conversation: closeConversation,
};

// تنفيذ دفعة استدعاءات أدوات وإرجاع رسائل tool جاهزة للحقن في المحادثة
// أي خطأ في أداة يُحوَّل لرسالة فشل خاصة بها — لا يوقف بقية الأدوات ولا يسقط الخط
export async function runAgentTools(
  toolCalls: ToolCall[],
  ctx: AgentToolContext
): Promise<ToolResultMessage[]> {
  return Promise.all(
    toolCalls.map(async (call): Promise<ToolResultMessage> => {
      const executor = EXECUTORS[call.name];
      if (!executor) {
        return { toolCallId: call.id, content: `أداة غير معروفة: ${call.name}` };
      }
      try {
        const content = await executor(ctx, parseArgs(call.argumentsJson));
        console.log(`[agent-tools] ${call.name}: ${content}`);
        return { toolCallId: call.id, content };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // أخطاء قاعدة البيانات المتوقعة تُبلَّغ للنموذج دون رفع خطأ
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          return { toolCallId: call.id, content: `فشل تنفيذ الأداة: ${message}` };
        }
        console.error(`[agent-tools] خطأ في أداة ${call.name}:`, e);
        return { toolCallId: call.id, content: "تعذّر تنفيذ الإجراء حالياً" };
      }
    })
  );
}
