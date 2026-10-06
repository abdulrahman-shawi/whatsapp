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
  | { kind: "BUSINESS_HOURS" } // الوقت الحالي ضمن ساعات العمل المضبوطة في التكاملات
  | { kind: "DB_CONTAINS"; text: string } // نتيجة QUERY_DB الأخيرة تحتوي النص…
  | { kind: "HAS_ASSIGNEE" } // للمحادثة موظف مسند واحد على الأقل
  | { kind: "STATUS_IS"; status: "AI" | "MANUAL" | "HANDED_OFF" } // حالة المحادثة
  | { kind: "HOURS_BETWEEN"; from: number; to: number } // الساعة الحالية بين ساعتين (0-23)
  | { kind: "DAY_OF_WEEK"; days: number[] } // اليوم الحالي ضمن أيام محددة (0=الأحد)
  | { kind: "MESSAGE_COUNT_MIN"; count: number } // عدد رسائل المحادثة لا يقل عن…
  | { kind: "IS_CLOSED" } // المحادثة مغلقة
  | { kind: "PHONE_CONTAINS"; text: string } // رقم العميل يحتوي النص…
  | { kind: "NAME_CONTAINS"; text: string } // اسم العميل يحتوي النص…
  | { kind: "ASSIGNEE_IS"; userId: string } // المسند إليه المحادثة هو الموظف…
  | { kind: "PLATFORM_IS"; platform: "WHATSAPP" | "WIDGET" } // قناة المحادثة
  | { kind: "VAR_EQUALS"; name: string; value: string } // متغير سير العمل يساوي القيمة
  | { kind: "LAST_OUTBOUND_HOURS"; hours: number }; // مرّت X ساعة على آخر رد منا (أو لم نرد أصلاً)

// فرع واحد في شرط متعدد: شرط + خطوات تنفذ عند تحققه
export type IfBranch = { condition: IfCondition; steps: WorkflowStep[] };

// أنواع خطوات سير العمل — تُخزن كعناصر داخل مصفوفة steps (JSON)
// الخطوات متداخلة عبر IF: لكل شرط فرعان then/else وكل منهما قائمة خطوات
export type WorkflowStep =
  | { type: "SEND_MESSAGE"; body: string; templateId?: string }
  | { type: "SEND_MEDIA"; url?: string; assetId?: string; assetName?: string; caption?: string } // صورة/فيديو/PDF من رابط أو ملف مرفوع
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
  | { type: "GOTO"; targetId?: string; step?: number } // انتقال مرسوم بسهم إلى خطوة في نفس المستوى (للأمام فقط)
  | { type: "CREATE_BOOKING"; title: string; scheduledAt: string; notes?: string }
  | { type: "RESUME_AI" } // إعادة تفعيل الرد الآلي للمحادثة (عكس STOP_AI)
  | { type: "ARCHIVE" } // أرشفة المحادثة
  | { type: "UNARCHIVE" } // إلغاء أرشفة المحادثة
  | { type: "MARK_READ" } // تعليم رسائل المحادثة مقروءة
  | { type: "SET_VAR"; name: string; value: string } // تعيين متغير — يُستخدم في VAR_EQUALS و{{var:الاسم}}
  | { type: "HTTP_REQUEST"; url: string; method: "GET" | "POST"; body?: string } // طلب عام — النتيجة في {{http}}
  | { type: "AI_CLASSIFY"; prompt: string; options: string[]; var: string } // تصنيف آخر رسالة بالذكاء الاصطناعي إلى خيار
  // شرط متعدد الفروع: يُنفذ أول فرع متحقق، وإلا فرع else (اختياري)
  // branches[0] يعادل if، branches[1..] تعادل else-if، وelseSteps تعادل else
  | { type: "IF"; branches: IfBranch[]; elseSteps: WorkflowStep[] };

// الشكل القديم لخطوة IF (شرط واحد ثم/else) — يُحوَّل تلقائياً عند التنفيذ والعرض
type LegacyIfStep = {
  type: "IF";
  condition: IfCondition;
  then: WorkflowStep[];
  else: WorkflowStep[];
};

// تحويل خطوة IF قديمة الشكل إلى الفروع المتعددة
export function normalizeStep(step: WorkflowStep): WorkflowStep {
  if (step.type !== "IF") return step;
  const legacy = step as unknown as Partial<LegacyIfStep> & {
    branches?: IfBranch[];
    elseSteps?: WorkflowStep[];
  };
  if (Array.isArray(legacy.branches)) return step;
  return {
    type: "IF",
    branches: [
      { condition: legacy.condition!, steps: Array.isArray(legacy.then) ? legacy.then : [] },
    ],
    elseSteps: Array.isArray(legacy.else) ? legacy.else : [],
  };
}

export function normalizeSteps(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map((s) => {
    const n = normalizeStep(s);
    if (n.type === "IF") {
      return {
        ...n,
        branches: n.branches.map((b) => ({ ...b, steps: normalizeSteps(b.steps) })),
        elseSteps: normalizeSteps(n.elseSteps),
      };
    }
    return n;
  });
}

// معرّف كل خطوة — تولّده الواجهة عند الإنشاء وتخزنه في عنصر JSON
// لازم لأسهم الانتقال: GOTO يشير به إلى الخطوة الهدف بدل الرقم المتقلب
export function stepId(step: WorkflowStep): string | undefined {
  return (step as { id?: string }).id;
}

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
  { type: "GOTO", label: "انتقال إلى خطوة (سهم)" },
  { type: "SET_VAR", label: "تعيين متغير" },
  { type: "HTTP_REQUEST", label: "طلب HTTP عام" },
  { type: "AI_CLASSIFY", label: "تصنيف بالذكاء الاصطناعي" },
  { type: "RESUME_AI", label: "إعادة تفعيل الرد الآلي" },
  { type: "ARCHIVE", label: "أرشفة المحادثة" },
  { type: "UNARCHIVE", label: "إلغاء أرشفة المحادثة" },
  { type: "MARK_READ", label: "تعليم الرسائل مقروءة" },
  { type: "IF", label: "شرط (إذا / وإلا إذا / وإلا)" },
] as const;

const MAX_TOTAL_STEPS = 40;
const MAX_DEPTH = 4; // عمق تداخل الشروط — منع استعلامات بلا حدود

// عدّ الخطوات شاملاً الفروع المتداخلة
function countSteps(steps: WorkflowStep[]): number {
  return steps.reduce((sum, s) => {
    if (s.type === "IF") {
      return (
        sum +
        1 +
        s.branches.reduce((b, branch) => b + countSteps(branch.steps), 0) +
        countSteps(s.elseSteps)
      );
    }
    return sum + 1;
  }, 0);
}

// التحقق من شرط IF — memberIds للشروط المرتبطة بالموظفين
function validateCondition(
  cond: IfCondition | undefined,
  label: string,
  errors: string[],
  memberIds: string[]
) {
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
    case "PHONE_CONTAINS":
    case "NAME_CONTAINS":
      if (!cond.text?.trim()) errors.push(`${label}: نص الشرط مطلوب`);
      break;
    case "ASSIGNEE_IS":
      if (cond.userId !== "any" && !memberIds.includes(cond.userId)) {
        errors.push(`${label}: الموظف المحدد ليس عضواً في الفريق`);
      }
      break;
    case "PLATFORM_IS":
      if (!["WHATSAPP", "WIDGET"].includes(cond.platform)) {
        errors.push(`${label}: القناة غير صالحة`);
      }
      break;
    case "VAR_EQUALS":
      if (!cond.name?.trim() || !cond.value?.trim()) {
        errors.push(`${label}: اسم المتغير والقيمة مطلوبان`);
      }
      break;
    case "LAST_OUTBOUND_HOURS": {
      const hours = Number(cond.hours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 30) {
        errors.push(`${label}: المدة بين ساعة و٧٢٠ ساعة`);
      }
      break;
    }
    case "HOURS_BETWEEN": {
      const from = Number(cond.from);
      const to = Number(cond.to);
      if (
        !Number.isInteger(from) || !Number.isInteger(to) ||
        from < 0 || from > 23 || to < 0 || to > 23 || from >= to
      ) {
        errors.push(`${label}: ساعتا البداية والنهاية بين 0 و23 والبداية قبل النهاية`);
      }
      break;
    }
    case "DAY_OF_WEEK": {
      const days = Array.isArray(cond.days) ? cond.days : [];
      const valid = days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      if (days.length === 0 || !valid) {
        errors.push(`${label}: اختر يوماً واحداً على الأقل (0-6)`);
      }
      break;
    }
    case "MESSAGE_COUNT_MIN": {
      const count = Number(cond.count);
      if (!Number.isInteger(count) || count < 1 || count > 1000) {
        errors.push(`${label}: العدد عدد صحيح بين 1 و1000`);
      }
      break;
    }
    case "STATUS_IS":
      if (!["AI", "MANUAL", "HANDED_OFF"].includes(cond.status)) {
        errors.push(`${label}: حالة المحادثة غير صالحة`);
      }
      break;
    case "BUSINESS_HOURS":
    case "HAS_ASSIGNEE":
    case "IS_CLOSED":
      break; // بلا إعدادات إضافية
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
          if (!step.url?.trim() && !step.assetId?.trim()) {
            errors.push(`${label}: ارفع ملفاً أو أدخل رابط وسائط`);
          }
          if (step.url?.trim() && !/^https?:\/\//.test(step.url)) {
            errors.push(`${label}: الرابط يجب أن يبدأ بـ http(s)://`);
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
        case "SET_VAR":
          if (!step.name?.trim() || !/^\w+$/.test(step.name.trim())) {
            errors.push(`${label}: اسم المتغير مطلوب (أحرف إنجليزية وأرقام وشرطة سفلية)`);
          }
          if (step.value === undefined || step.value === null) {
            errors.push(`${label}: قيمة المتغير مطلوبة`);
          }
          break;
        case "HTTP_REQUEST":
          if (!/^https?:\/\//.test(step.url ?? "")) {
            errors.push(`${label}: الرابط يجب أن يبدأ بـ http(s)://`);
          }
          if (step.method && !["GET", "POST"].includes(step.method)) {
            errors.push(`${label}: الطريقة GET أو POST`);
          }
          break;
        case "AI_CLASSIFY": {
          const options = Array.isArray(step.options) ? step.options.filter((o) => o?.trim()) : [];
          if (options.length < 2 || options.length > 10) {
            errors.push(`${label}: الخيارات بين 2 و10`);
          }
          if (!step.var?.trim() || !/^\w+$/.test(step.var.trim())) {
            errors.push(`${label}: اسم متغير التصنيف مطلوب (أحرف إنجليزية وأرقام)`);
          }
          break;
        }
        case "GOTO": {
          // شكل جديد: targetId (معرف الخطوة الهدف) — شكل قديم: رقم الخطوة
          if (step.targetId?.trim()) {
            const exists = list.some((s) => stepId(s) === step.targetId);
            if (!exists) {
              errors.push(`${label}: خطوة الهدف غير موجودة في نفس المستوى`);
            }
          } else if (
            !Number.isInteger(step.step) ||
            step.step! < 1 ||
            step.step! > list.length
          ) {
            errors.push(
              `${label}: حدد الخطوة الهدف — القفز للأمام ضمن نفس المستوى`
            );
          }
          break;
        }
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
            errors.push(`${label}: الحد الأقصى ${MAX_DEPTH} مستويات تداخل للشروط`);
            break;
          }
          const branches = Array.isArray(step.branches) ? step.branches : [];
          if (branches.length === 0 || branches.length > 10) {
            errors.push(`${label}: عدد الفروع بين 1 و10`);
            break;
          }
          branches.forEach((branch, bi) => {
            const branchLabel = `${label}←فرع${bi + 1}:`;
            validateCondition(branch.condition, branchLabel, errors, memberIds);
            if (!Array.isArray(branch.steps)) {
              errors.push(`${branchLabel}: قائمة الخطوات غير صالحة`);
              return;
            }
            walk(branch.steps, depth + 1, branchLabel);
          });
          const elseSteps = Array.isArray(step.elseSteps) ? step.elseSteps : [];
          walk(elseSteps, depth + 1, `${label}←else:`);
          const anySteps =
            branches.some((b) => Array.isArray(b.steps) && b.steps.length > 0) ||
            elseSteps.length > 0;
          if (!anySteps) {
            errors.push(`${label}: أضف خطوة في أحد الفروع على الأقل`);
          }
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

// استبدال متغيرات التخصيص في نص الرسالة — {{var:الاسم}} للمتغيرات المخصصة
function personalize(body: string, ctx: WorkflowContext): string {
  return body
    .replace(/\{\{var:(\w+)\}\}/g, (_m, name: string) => ctx.vars[name] ?? "")
    .replaceAll("{{name}}", ctx.contactName ?? "عميلنا الكريم")
    .replaceAll("{{phone}}", ctx.waPhone)
    .replaceAll("{{stage}}", ctx.stage ?? "")
    .replaceAll("{{tags}}", (ctx.tags ?? []).join("، "))
    .replaceAll("{{db}}", ctx.vars["db"] ?? "")
    .replaceAll("{{http}}", ctx.vars["http"] ?? "");
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

// إرسال وسائط: من ملف مرفوع (assetId) أو من رابط مباشر
async function sendWorkflowMedia(
  ctx: WorkflowContext,
  media: { url?: string; assetId?: string },
  caption?: string
): Promise<void> {
  const creds = await resolveWhatsAppCreds(ctx.workspaceId);
  if (!creds) throw new Error("لا يوجد مزود واتساب مُعدّ");

  let buffer: Buffer;
  let mime: string;
  let filename: string;

  if (media.assetId?.trim()) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: media.assetId, workspaceId: ctx.workspaceId },
    });
    if (!asset) throw new Error("الملف المرفوع غير موجود");
    buffer = Buffer.from(asset.dataBase64, "base64");
    mime = asset.mime;
    filename = asset.filename;
  } else if (media.url?.trim()) {
    const res = await fetch(media.url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`تعذّر تنزيل الوسائط — الحالة ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    mime =
      res.headers.get("content-type")?.split(";")[0]?.trim() || mimeFromUrl(media.url);
    filename = decodeURIComponent(media.url.split("?")[0].split("/").pop() || "ملف");
  } else {
    throw new Error("لا يوجد ملف أو رابط وسائط");
  }

  if (buffer.length === 0) throw new Error("الملف فارغ");
  if (buffer.length > 16 * 1024 * 1024) throw new Error("حجم الملف يتجاوز 16MB");

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
    case "HAS_ASSIGNEE": {
      if (!ctx.conversationId) return false;
      const count = await prisma.conversationAssignee.count({
        where: { conversationId: ctx.conversationId },
      });
      return count > 0;
    }
    case "STATUS_IS": {
      if (!ctx.conversationId) return false;
      const conversation = await prisma.conversation.findUnique({
        where: { id: ctx.conversationId },
        select: { status: true },
      });
      return conversation?.status === cond.status;
    }
    case "HOURS_BETWEEN": {
      const h = new Date().getHours();
      return h >= cond.from && h < cond.to;
    }
    case "DAY_OF_WEEK":
      return (cond.days ?? []).includes(new Date().getDay());
    case "MESSAGE_COUNT_MIN": {
      if (!ctx.conversationId) return false;
      const count = await prisma.message.count({
        where: { conversationId: ctx.conversationId, isNote: false },
      });
      return count >= cond.count;
    }
    case "IS_CLOSED": {
      if (!ctx.conversationId) return false;
      const conversation = await prisma.conversation.findUnique({
        where: { id: ctx.conversationId },
        select: { closedAt: true },
      });
      return conversation?.closedAt != null;
    }
    case "PHONE_CONTAINS":
      return ctx.waPhone.includes(cond.text.trim());
    case "NAME_CONTAINS":
      return (ctx.contactName ?? "").toLowerCase().includes(cond.text.trim().toLowerCase());
    case "ASSIGNEE_IS": {
      if (!ctx.conversationId) return false;
      if (cond.userId === "any") {
        const count = await prisma.conversationAssignee.count({
          where: { conversationId: ctx.conversationId },
        });
        return count > 0;
      }
      const assignee = await prisma.conversationAssignee.findFirst({
        where: { conversationId: ctx.conversationId, userId: cond.userId },
      });
      return assignee != null;
    }
    case "PLATFORM_IS": {
      if (!ctx.conversationId) return false;
      const conversation = await prisma.conversation.findUnique({
        where: { id: ctx.conversationId },
        select: { platform: true },
      });
      return conversation?.platform === cond.platform;
    }
    case "VAR_EQUALS":
      return (ctx.vars[cond.name.trim()] ?? "") === cond.value.trim();
    case "LAST_OUTBOUND_HOURS": {
      if (!ctx.conversationId) return false;
      const last = await prisma.message.findFirst({
        where: { conversationId: ctx.conversationId, direction: "OUTBOUND", isNote: false },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      // لا رد سابق منا = الشرط متحقق (لم نرد أصلاً منذ البداية)
      if (!last) return true;
      return Date.now() - last.createdAt.getTime() >= cond.hours * 3_600_000;
    }
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
      await sendWorkflowMedia(ctx, { url: step.url, assetId: step.assetId }, step.caption);
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
    case "RESUME_AI": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة");
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: "AI" },
      });
      return "أُعيد تفعيل الرد الآلي";
    }
    case "ARCHIVE": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة");
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { isArchived: true },
      });
      return "أُرشفت المحادثة";
    }
    case "UNARCHIVE": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة");
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { isArchived: false },
      });
      return "أُلغي أرشفة المحادثة";
    }
    case "MARK_READ": {
      if (!ctx.conversationId) throw new Error("لا توجد محادثة");
      await prisma.message.updateMany({
        where: { conversationId: ctx.conversationId, direction: "INBOUND", isRead: false },
        data: { isRead: true },
      });
      return "عُلّمت الرسائل مقروءة";
    }
    case "SET_VAR": {
      ctx.vars[step.name.trim()] = personalize(step.value, ctx);
      return `ضُبط المتغير ${step.name.trim()}`;
    }
    case "HTTP_REQUEST": {
      const res = await fetch(step.url, {
        method: step.method === "POST" ? "POST" : "GET",
        headers: step.method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body:
          step.method === "POST" && step.body
            ? personalize(step.body, ctx)
            : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      const text = (await res.text().catch(() => "")).slice(0, 2000);
      ctx.vars["http"] = text;
      if (!res.ok) throw new Error(`الطلب ردّ بالحالة ${res.status} — النتيجة في {{http}}`);
      return "نُفّذ الطلب — النتيجة في {{http}}";
    }
    case "AI_CLASSIFY": {
      const options = step.options.map((o) => o.trim()).filter(Boolean);
      const aiConfig = await resolveAiConfig(ctx.workspaceId);
      const systemPrompt = [
        step.prompt?.trim() || "صنّف نص العميل التالي إلى واحد من الخيارات التالية.",
        `الخيارات: ${options.join(" | ")}`,
        `أجب بأحد الخيارات حرفياً وبلا أي شرح إضافي.`,
      ].join("\n");
      const result = await generateReply(
        [{ role: "user", content: ctx.text || "(لا يوجد نص)" }],
        systemPrompt,
        [],
        aiConfig
      );
      if (!result) throw new Error("تعذّر تصنيف النص");
      // نتطابق الخيار المعاد — أي خيار يظهر في الرد (حساسية حالة غير مهمة)
      const reply = result.content.trim();
      const matched =
        options.find((o) => reply === o) ??
        options.find((o) => reply.toLowerCase().includes(o.toLowerCase())) ??
        "";
      ctx.vars[step.var.trim()] = matched;
      // احتساب التوكنات في رصيد الباقة
      const month = new Date().toISOString().slice(0, 7);
      await prisma.usageRecord.upsert({
        where: { workspaceId_month: { workspaceId: ctx.workspaceId, month } },
        update: { tokensUsed: { increment: result.usage.totalTokens } },
        create: {
          workspaceId: ctx.workspaceId,
          month,
          tokensUsed: result.usage.totalTokens,
        },
      });
      if (!matched) return `تصنيف بلا تطابق — {{${step.var.trim()}}} فارغ (الرد: ${reply.slice(0, 40)})`;
      return `صُنّف النص إلى "${matched}" في {{${step.var.trim()}}}`;
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
      const multi = normalizeStep(step);
      if (multi.type !== "IF") continue;
      // أول فرع متحقق يُنفذ، وإلا فرع else — يشبه if / else-if / else
      let chosen: WorkflowStep[] | null = null;
      let matched = -1;
      for (let b = 0; b < multi.branches.length; b++) {
        const branch = multi.branches[b];
        const passed = await evaluateCondition(branch.condition, ctx).catch(() => false);
        logs.push(`↳ IF فرع${b + 1} (${branch.condition.kind}) → ${passed ? "متحقق" : "لا"}`);
        if (passed) {
          chosen = branch.steps;
          matched = b;
          break;
        }
      }
      if (chosen === null && multi.elseSteps.length > 0) {
        chosen = multi.elseSteps;
        logs.push("↳ IF → else");
      }
      if (chosen && chosen.length > 0) stack.push({ steps: chosen, index: 0 });
      if (matched < 0 && multi.elseSteps.length === 0) {
        logs.push("↳ IF → لا فرع متحقق ولا else — تُخطّى");
      }
      continue;
    }

    if (step.type === "GOTO") {
      // الانتقال المرسوم بسهم: نحوّل targetId إلى فهرس ضمن القائمة الحالية
      // القفز للأمام فقط — يمنع الحلقات اللانهائية
      let targetIndex = -1;
      if (step.targetId?.trim()) {
        targetIndex = frame.steps.findIndex((s) => stepId(s) === step.targetId);
      } else if (Number.isInteger(step.step)) {
        targetIndex = step.step! - 1; // الشكل القديم برقم الخطوة
      }
      if (targetIndex >= frame.index && targetIndex < frame.steps.length) {
        frame.index = targetIndex;
        logs.push(`↷ انتقال → ${step.targetId?.trim() ? "الخطوة المحددة" : `الخطوة ${targetIndex + 1}`}`);
      } else {
        failed = true;
        logs.push(`✗ GOTO: الهدف ليس للأمام أو غير موجود في نفس المستوى`);
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
