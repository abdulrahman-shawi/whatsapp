// أدوات تصدير/استيراد سير العمل — وحدة صافية بلا اعتماديات خادم (تصلح للعميل)
// تقلّد قواعد التحقق في app/api/workflows/route.ts مع تسامح ضروري لما لا يمكن فحصه جهة العميل

export const WORKFLOW_TRIGGERS = [
  "KEYWORD",
  "FROM_NUMBERS",
  "NEW_CONTACT",
  "STAGE_CHANGE",
  "NO_REPLY",
] as const;

export const triggerLabels: Record<string, string> = {
  KEYWORD: "رسالة بكلمة مفتاحية",
  FROM_NUMBERS: "رسالة من أرقام محددة",
  NEW_CONTACT: "عميل جديد",
  STAGE_CHANGE: "تغيير حالة العميل",
  NO_REPLY: "لا رد من العميل",
};

export const WORKFLOW_STEP_LABELS: Record<string, string> = {
  SEND_MESSAGE: "إرسال رسالة أو قالب",
  SEND_MEDIA: "إرسال وسائط",
  REQUEST_LOCATION: "طلب موقع العميل",
  ASSIGN: "إسناد المحادثة لموظف",
  SET_AGENT: "ربط بوكيل ذكي",
  SET_STAGE: "تغيير حالة العميل",
  ADD_TAG: "إضافة وسم",
  REMOVE_TAG: "إزالة وسم",
  ADD_NOTE: "ملاحظة داخلية",
  AI_REPLY: "رد بالذكاء الاصطناعي",
  SEARCH_KNOWLEDGE: "بحث في المعرفة",
  QUERY_DB: "استعلام قاعدة بيانات",
  STOP_AI: "إيقاف الرد الآلي",
  CLOSE: "إغلاق المحادثة",
  REOPEN: "إعادة فتح المحادثة",
  WAIT: "انتظار (تأخير)",
  WEBHOOK: "Webhook خارجي",
  CREATE_BOOKING: "إنشاء حجز موعد",
  GOTO: "انتقال إلى خطوة",
  SET_VAR: "تعيين متغير",
  HTTP_REQUEST: "طلب HTTP عام",
  AI_CLASSIFY: "تصنيف بالذكاء الاصطناعي",
  RESUME_AI: "إعادة تفعيل الرد الآلي",
  ARCHIVE: "أرشفة المحادثة",
  UNARCHIVE: "إلغاء أرشفة المحادثة",
  MARK_READ: "تعليم الرسائل مقروءة",
  IF: "شرط (إذا / وإلا)",
  BUSINESS_HOURS: "ساعات العمل (شيفت)",
};

const MAX_TOTAL_STEPS = 40;
const MAX_DEPTH = 4;

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isHttpUrl(v: unknown): boolean {
  return typeof v === "string" && /^https?:\/\//.test(v);
}

// تجهيز خطوات للتصدير: إزالة id/معرفات مساحة العمل/الطوابع،
// وتحويل GOTO المرسوم بسهم (targetId) إلى رقم خطوة ضمن نفس المستوى
function stripIdsInList(list: unknown[]): unknown[] {
  const idIndex = new Map<string, number>();
  list.forEach((s, i) => {
    if (isObj(s) && typeof s.id === "string" && s.id) idIndex.set(s.id, i);
  });
  return list.map((s) => {
    if (!isObj(s)) return s;
    const out: Json = { ...s };
    delete out.id;
    if (out.type === "GOTO" && typeof out.targetId === "string" && idIndex.has(out.targetId)) {
      out.step = idIndex.get(out.targetId)! + 1;
      delete out.targetId;
    }
    if (out.type === "IF") {
      if (Array.isArray(out.branches)) {
        out.branches = out.branches.map((b) =>
          isObj(b) ? { ...b, steps: stripIdsInList(Array.isArray(b.steps) ? b.steps : []) } : b
        );
      }
      if (Array.isArray(out.elseSteps)) out.elseSteps = stripIdsInList(out.elseSteps);
      if (Array.isArray(out.then)) out.then = stripIdsInList(out.then);
      if (Array.isArray(out["else"])) out["else"] = stripIdsInList(out["else"]);
    }
    if (out.type === "BUSINESS_HOURS") {
      out.successSteps = stripIdsInList(
        Array.isArray(out.successSteps) ? out.successSteps : []
      );
      out.failureSteps = stripIdsInList(
        Array.isArray(out.failureSteps) ? out.failureSteps : []
      );
    }
    return out;
  });
}

// بناء ملف التصدير: البنية المعروفة + خطوات مُنقّاة
export function buildWorkflowExport(w: {
  name: string;
  trigger: string;
  triggerConfig: unknown;
  steps: unknown;
}): Json {
  return {
    flovooWorkflow: 1,
    name: w.name,
    trigger: w.trigger,
    triggerConfig: isObj(w.triggerConfig) ? w.triggerConfig : {},
    steps: Array.isArray(w.steps) ? stripIdsInList(w.steps) : [],
  };
}

// تحميل ملف JSON باسم سير العمل
export function downloadWorkflowExport(
  w: { name: string; trigger: string; triggerConfig: unknown; steps: unknown }
): void {
  const payload = JSON.stringify(buildWorkflowExport(w), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${w.name.replace(/[\\/:*?"<>|]/g, "-").trim() || "workflow"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// تطبيع خطوة IF القديمة (condition/then/else) إلى الفروع المتعددة
function normalizeIfStep(step: Json): Json {
  if (step.type !== "IF") return step;
  if (Array.isArray(step.branches)) return step;
  const branches = [
    {
      condition: step.condition,
      steps: Array.isArray(step.then) ? step.then : [],
    },
  ];
  const out: Json = { ...step };
  delete out.condition;
  delete out.then;
  delete out["else"];
  out.branches = branches;
  out.elseSteps = Array.isArray(step["else"]) ? step["else"] : [];
  return out;
}

// التحقق من إعدادات المحفّز — نفس قواعد POST /api/workflows
function validateTriggerConfig(
  trigger: string,
  tc: unknown,
  errors: string[]
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const src = isObj(tc) ? tc : {};
  if (trigger === "KEYWORD") {
    const keywords = Array.isArray(src.keywords)
      ? src.keywords.filter((k) => typeof k === "string" && k.trim())
      : [];
    if (keywords.length === 0) errors.push("المحفّز بالكلمة المفتاحية: أضف كلمة واحدة على الأقل");
    else config.keywords = keywords.map((k) => (k as string).trim());
  }
  if (trigger === "FROM_NUMBERS") {
    const phones = Array.isArray(src.phones)
      ? src.phones.filter((p) => typeof p === "string" && p.trim())
      : [];
    if (phones.length === 0) errors.push("محفّز الأرقام: أضف رقماً واحداً على الأقل");
    else config.phones = phones.map((p) => (p as string).trim());
  }
  if (trigger === "STAGE_CHANGE") {
    if (typeof src.toStage !== "string" || !src.toStage) {
      errors.push("محفّز تغيير الحالة: الحالة الجديدة مطلوبة");
    } else {
      config.toStage = src.toStage;
      if (typeof src.fromStage === "string" && src.fromStage) config.fromStage = src.fromStage;
    }
  }
  if (trigger === "NO_REPLY") {
    const hours = Number(src.hours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) {
      errors.push("محفّز لا رد: مدة الصمت بين ساعة و٧٢٠ ساعة (٣٠ يوماً)");
    } else {
      config.hours = Math.round(hours);
    }
  }
  return config;
}

const CONDITION_KINDS = [
  "STAGE",
  "HAS_TAG",
  "TEXT_CONTAINS",
  "BUSINESS_HOURS",
  "DB_CONTAINS",
  "HAS_ASSIGNEE",
  "STATUS_IS",
  "HOURS_BETWEEN",
  "DAY_OF_WEEK",
  "MESSAGE_COUNT_MIN",
  "IS_CLOSED",
  "PHONE_CONTAINS",
  "NAME_CONTAINS",
  "ASSIGNEE_IS",
  "PLATFORM_IS",
  "VAR_EQUALS",
  "LAST_OUTBOUND_HOURS",
];

function validateCondition(cond: unknown, label: string, errors: string[]): void {
  if (!isObj(cond) || typeof cond.kind !== "string") {
    errors.push(`${label}: الشرط مطلوب`);
    return;
  }
  if (!CONDITION_KINDS.includes(cond.kind)) {
    errors.push(`${label}: نوع شرط غير معروف`);
    return;
  }
  switch (cond.kind) {
    case "HAS_TAG":
      if (typeof cond.tag !== "string" || !cond.tag.trim()) errors.push(`${label}: الوسم مطلوب`);
      break;
    case "TEXT_CONTAINS":
    case "DB_CONTAINS":
    case "PHONE_CONTAINS":
    case "NAME_CONTAINS":
      if (typeof cond.text !== "string" || !cond.text.trim()) errors.push(`${label}: نص الشرط مطلوب`);
      break;
    case "STATUS_IS":
      if (!["AI", "MANUAL", "HANDED_OFF"].includes(String(cond.status))) {
        errors.push(`${label}: حالة المحادثة غير صالحة`);
      }
      break;
    case "PLATFORM_IS":
      if (!["WHATSAPP", "WIDGET"].includes(String(cond.platform))) {
        errors.push(`${label}: القناة غير صالحة`);
      }
      break;
    case "VAR_EQUALS":
      if (typeof cond.name !== "string" || !cond.name.trim() ||
          typeof cond.value !== "string" || !cond.value.trim()) {
        errors.push(`${label}: اسم المتغير والقيمة مطلوبان`);
      }
      break;
    case "HOURS_BETWEEN": {
      const from = Number(cond.from);
      const to = Number(cond.to);
      if (!Number.isInteger(from) || !Number.isInteger(to) ||
          from < 0 || from > 23 || to < 0 || to > 23 || from >= to) {
        errors.push(`${label}: ساعتا البداية والنهاية بين 0 و23 والبداية قبل النهاية`);
      }
      break;
    }
    case "DAY_OF_WEEK": {
      const days = Array.isArray(cond.days) ? cond.days : [];
      if (days.length === 0 || !days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) {
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
    case "LAST_OUTBOUND_HOURS": {
      const hours = Number(cond.hours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 30) {
        errors.push(`${label}: المدة بين ساعة و٧٢٠ ساعة`);
      }
      break;
    }
    default:
      break; // STAGE / BUSINESS_HOURS / HAS_ASSIGNEE / IS_CLOSED / ASSIGNEE_IS بلا إعدادات إضافية نتحقق منها هنا
  }
}

function countSteps(list: unknown[]): number {
  let total = 0;
  for (const s of list) {
    if (isObj(s) && s.type === "IF") {
      const branches = Array.isArray(s.branches) ? s.branches : [];
      total +=
        1 +
        branches.reduce(
          (b, branch) =>
            b + (isObj(branch) && Array.isArray(branch.steps) ? countSteps(branch.steps) : 0),
          0
        ) +
        (Array.isArray(s.elseSteps) ? countSteps(s.elseSteps) : 0);
    } else if (isObj(s) && s.type === "BUSINESS_HOURS") {
      total +=
        1 +
        (Array.isArray(s.successSteps) ? countSteps(s.successSteps) : 0) +
        (Array.isArray(s.failureSteps) ? countSteps(s.failureSteps) : 0);
    } else {
      total += 1;
    }
  }
  return total;
}

// التحقق من بنية الخطوات مع التطبيع — نفس قواعد validateSteps في lib/workflows.ts
// memberIds غير متاح جهة العميل: ASSIGN لموظف محدد (أي قيمة غير "any") تُرفض
function validateAndNormalizeSteps(
  raw: unknown,
  errors: string[]
): unknown[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push("أضف خطوة واحدة على الأقل");
    return null;
  }
  if (countSteps(raw) > MAX_TOTAL_STEPS) {
    errors.push(`الحد الأقصى ${MAX_TOTAL_STEPS} خطوة (شاملة فروع الشروط)`);
  }

  function walk(list: unknown[], depth: number, prefix: string): unknown[] | null {
    const out: unknown[] = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const label = `${prefix}${i + 1}`;
      if (!isObj(s) || typeof s.type !== "string") {
        errors.push(`${label}: خطوة غير صالحة`);
        return null;
      }
      if (!(s.type in WORKFLOW_STEP_LABELS)) {
        errors.push(`${label}: نوع خطوة غير معروف "${s.type}"`);
        return null;
      }
      const step: Json = { ...s };
      delete step.id; // لا معرفات عبر الاستيراد — تولّدها الواجهة من جديد

      switch (step.type) {
        case "SEND_MESSAGE":
          if (!(typeof step.body === "string" && step.body.trim()) && !step.templateId) {
            errors.push(`${label}: نص الرسالة أو قالب مطلوب`);
          }
          break;
        case "SEND_MEDIA":
          if (!(typeof step.url === "string" && step.url.trim()) &&
              !(typeof step.assetId === "string" && step.assetId.trim())) {
            errors.push(`${label}: رابط وسائط أو ملف مطلوب`);
          }
          if (typeof step.url === "string" && step.url.trim() && !isHttpUrl(step.url)) {
            errors.push(`${label}: الرابط يجب أن يبدأ بـ http(s)://`);
          }
          break;
        case "ASSIGN":
          if (step.userId !== "any") {
            errors.push(`${label}: الإسناد لموظف محدد لا يمكن استيراده — استخدم "any" أو احذف الخطوة`);
          }
          break;
        case "SET_AGENT":
          if (typeof step.agentId !== "string" || !step.agentId.trim()) {
            errors.push(`${label}: اختر الوكيل`);
          }
          break;
        case "SET_STAGE":
          if (typeof step.stage !== "string" || !step.stage.trim()) {
            errors.push(`${label}: حالة العميل مطلوبة`);
          }
          break;
        case "ADD_TAG":
        case "REMOVE_TAG":
          if (typeof step.tag !== "string" || !step.tag.trim()) errors.push(`${label}: الوسم مطلوب`);
          break;
        case "ADD_NOTE":
          if (typeof step.body !== "string" || !step.body.trim()) {
            errors.push(`${label}: نص الملاحظة مطلوب`);
          }
          break;
        case "QUERY_DB":
          if (typeof step.sourceId !== "string" || !step.sourceId.trim()) {
            errors.push(`${label}: اختر مصدر قاعدة البيانات`);
          }
          break;
        case "CREATE_BOOKING":
          if (typeof step.title !== "string" || !step.title.trim()) {
            errors.push(`${label}: عنوان الحجز مطلوب`);
          }
          if (typeof step.scheduledAt !== "string" || isNaN(Date.parse(step.scheduledAt))) {
            errors.push(`${label}: موعد الحجز غير صالح`);
          }
          break;
        case "SET_VAR":
          if (typeof step.name !== "string" || !/^\w+$/.test(step.name.trim())) {
            errors.push(`${label}: اسم المتغير مطلوب (أحرف إنجليزية وأرقام وشرطة سفلية)`);
          }
          if (step.value === undefined || step.value === null) {
            errors.push(`${label}: قيمة المتغير مطلوبة`);
          }
          break;
        case "HTTP_REQUEST":
          if (!isHttpUrl(step.url)) errors.push(`${label}: الرابط يجب أن يبدأ بـ http(s)://`);
          if (step.method !== undefined && !["GET", "POST"].includes(String(step.method))) {
            errors.push(`${label}: الطريقة GET أو POST`);
          }
          break;
        case "WEBHOOK":
          if (!isHttpUrl(step.url)) errors.push(`${label}: رابط Webhook يجب أن يبدأ بـ http(s)://`);
          break;
        case "WAIT": {
          const minutes = Number(step.minutes);
          if (!Number.isInteger(minutes) || minutes < 1 || minutes > 7 * 24 * 60) {
            errors.push(`${label}: مدة الانتظار بين دقيقة وأسبوع`);
          } else {
            step.minutes = minutes;
          }
          break;
        }
        case "AI_CLASSIFY": {
          const options = Array.isArray(step.options)
            ? step.options.filter((o) => typeof o === "string" && o.trim())
            : [];
          if (options.length < 2 || options.length > 10) errors.push(`${label}: الخيارات بين 2 و10`);
          if (typeof step.var !== "string" || !/^\w+$/.test(step.var.trim())) {
            errors.push(`${label}: اسم متغير التصنيف مطلوب (أحرف إنجليزية وأرقام)`);
          }
          break;
        }
        case "GOTO":
          if (typeof step.targetId === "string" && step.targetId.trim()) {
            errors.push(`${label}: الانتقال المرسوم بسهم لا يمكن استيراده — أعد رسمه في المحرر`);
          } else {
            const n = Number(step.step);
            if (!Number.isInteger(n) || n < 1) {
              errors.push(`${label}: حدد الخطوة الهدف — القفز للأمام ضمن نفس المستوى`);
            } else {
              delete step.targetId;
              step.step = n;
            }
          }
          break;
        case "IF": {
          if (depth >= MAX_DEPTH) {
            errors.push(`${label}: الحد الأقصى ${MAX_DEPTH} مستويات تداخل للشروط`);
            break;
          }
          const normalized = normalizeIfStep(step);
          const branches = Array.isArray(normalized.branches) ? normalized.branches : [];
          if (branches.length === 0 || branches.length > 10) {
            errors.push(`${label}: عدد الفروع بين 1 و10`);
            break;
          }
          let anySteps = false;
          const newBranches = branches.map((b, bi) => {
            const branchLabel = `${label}←فرع${bi + 1}:`;
            const branch = isObj(b) ? b : {};
            validateCondition(branch.condition, branchLabel, errors);
            const branchSteps = Array.isArray(branch.steps) ? branch.steps : [];
            if (branchSteps.length > 0) anySteps = true;
            const inner = walk(branchSteps, depth + 1, branchLabel);
            return { condition: branch.condition, steps: inner ?? [] };
          });
          const elseSteps = Array.isArray(normalized.elseSteps) ? normalized.elseSteps : [];
          if (elseSteps.length > 0) anySteps = true;
          const newElse = walk(elseSteps, depth + 1, `${label}←else:`) ?? [];
          if (!anySteps) errors.push(`${label}: أضف خطوة في أحد الفروع على الأقل`);
          out.push({ type: "IF", branches: newBranches, elseSteps: newElse });
          continue;
        }
        case "BUSINESS_HOURS": {
          if (depth >= MAX_DEPTH) {
            errors.push(`${label}: الحد الأقصى ${MAX_DEPTH} مستويات تداخل للشروط`);
            break;
          }
          const days = Array.isArray(step.days) ? step.days : [];
          if (
            days.length === 0 ||
            !days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
          ) {
            errors.push(`${label}: اختر يوماً واحداً على الأقل (0-6)`);
          }
          const validTime = (v: unknown) =>
            typeof v === "string" &&
            /^\d{2}:\d{2}$/.test(v) &&
            Number(v.slice(0, 2)) < 24 &&
            Number(v.slice(3, 5)) < 60;
          if (!validTime(step.from) || !validTime(step.to)) {
            errors.push(`${label}: وقت البداية والنهاية بصيغة HH:mm صالحة`);
          }
          if (
            typeof step.timezone !== "string" ||
            !step.timezone.trim() ||
            step.timezone.trim().length > 64
          ) {
            errors.push(`${label}: المنطقة الزمنية مطلوبة (٦٤ حرفاً كحد أقصى)`);
          }
          const successSteps = Array.isArray(step.successSteps) ? step.successSteps : [];
          const failureSteps = Array.isArray(step.failureSteps) ? step.failureSteps : [];
          const newSuccess = walk(successSteps, depth + 1, `${label}←عند التحقق:`) ?? [];
          const newFailure = walk(failureSteps, depth + 1, `${label}←عند عدم التحقق:`) ?? [];
          if (successSteps.length === 0 && failureSteps.length === 0) {
            errors.push(`${label}: أضف خطوة في أحد الفرعين على الأقل`);
          }
          out.push({
            type: "BUSINESS_HOURS",
            days,
            from: step.from,
            to: step.to,
            timezone: step.timezone,
            successSteps: newSuccess,
            failureSteps: newFailure,
          });
          continue;
        }
        default:
          break;
      }
      out.push(step);
    }
    return out;
  }

  return walk(raw, 0, "الخطوة ");
}

export type ParsedWorkflowImport = {
  name: string;
  trigger: string;
  triggerConfig: Record<string, unknown>;
  steps: unknown[];
};

// تحليل نص JSON مستورَد والتحقق منه — يرمي Error برسالة عربية عند الفشل
export function parseWorkflowImport(text: string): ParsedWorkflowImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("تعذّرت قراءة الملف — تأكد أنه نص JSON صالح");
  }
  if (!isObj(data)) throw new Error("ملف غير صالح — كائن JSON متوقع");
  if (data.flovooWorkflow !== 1) {
    throw new Error("هذا الملف ليس ملف سير عمل صادراً من فلوفو (الوسم flovooWorkflow مفقود)");
  }
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) throw new Error("اسم سير العمل مفقود في الملف");

  const trigger = typeof data.trigger === "string" ? data.trigger : "";
  if (!(WORKFLOW_TRIGGERS as readonly string[]).includes(trigger)) {
    throw new Error(`محفّز غير صالح "${trigger}" — القيم المسموحة: ${WORKFLOW_TRIGGERS.join("، ")}`);
  }

  const errors: string[] = [];
  const triggerConfig = validateTriggerConfig(trigger, data.triggerConfig, errors);
  const steps = validateAndNormalizeSteps(data.steps, errors);
  if (errors.length > 0) throw new Error(errors.join(" — "));
  if (!steps) throw new Error("الخطوات غير صالحة");

  return { name, trigger, triggerConfig, steps };
}

// سطر معاينة قصير لخطوة في قوائم المعاينة
export function stepPreview(step: unknown): string {
  if (!isObj(step)) return "—";
  const label = WORKFLOW_STEP_LABELS[step.type as string] ?? String(step.type ?? "خطوة");
  switch (step.type) {
    case "SEND_MESSAGE": {
      const body = typeof step.body === "string" ? step.body.trim() : "";
      return body ? `${label}: ${body.slice(0, 60)}${body.length > 60 ? "…" : ""}` : `${label}: [قالب]`;
    }
    case "SEND_MEDIA": {
      const detail = typeof step.caption === "string" && step.caption.trim()
        ? step.caption
        : typeof step.url === "string"
          ? step.url
          : "ملف مرفوع";
      return `${label}: ${detail.slice(0, 60)}`;
    }
    case "WAIT":
      return `${label}: ${step.minutes} دقيقة`;
    case "ADD_TAG":
    case "REMOVE_TAG":
      return `${label}: ${String(step.tag ?? "")}`;
    case "ADD_NOTE": {
      const body = typeof step.body === "string" ? step.body : "";
      return `${label}: ${body.slice(0, 60)}`;
    }
    case "SET_STAGE":
      return `${label}: ${String(step.stage ?? "")}`;
    case "IF":
      return `${label} (${Array.isArray(step.branches) ? step.branches.length : 1} فرع)`;
    case "BUSINESS_HOURS": {
      const days = Array.isArray(step.days) ? ([...step.days] as number[]).sort((a, b) => a - b) : [];
      const from = typeof step.from === "string" ? step.from : "—";
      const to = typeof step.to === "string" ? step.to : "—";
      const daysText = days.length > 0 ? days.join("-") : "—";
      return `ساعات العمل: ${daysText} ${from}-${to}`;
    }
    default:
      return label;
  }
}
