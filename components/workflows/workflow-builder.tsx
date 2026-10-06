"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Bot,
  CalendarPlus,
  CheckCheck,
  Clock,
  CornerUpRight,
  Database,
  Flag,
  GitBranch,
  Globe,
  GripVertical,
  Image,
  ListFilter,
  Loader2,
  MailOpen,
  MapPin,
  Play,
  Plus,
  RotateCcw,
  Save,
  Send,
  StickyNote,
  Tag,
  Trash2,
  UserCheck,
  Variable,
  Webhook,
  Workflow as WorkflowIcon,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CONTACT_STAGES, stageConfig } from "@/lib/contact-stages";
import { triggerLabels } from "./workflows-client";

// خطوة بصيغة JSON مرنة — الحقول حسب النوع
type Step = Record<string, unknown> & { type: string };

type RunRow = { id: string; status: string; logs: string; createdAt: string };

type IfCondition =
  | { kind: "STAGE"; stage: string }
  | { kind: "HAS_TAG"; tag: string }
  | { kind: "TEXT_CONTAINS"; text: string }
  | { kind: "BUSINESS_HOURS" }
  | { kind: "DB_CONTAINS"; text: string }
  | { kind: "HAS_ASSIGNEE" }
  | { kind: "STATUS_IS"; status: string }
  | { kind: "HOURS_BETWEEN"; from: number; to: number }
  | { kind: "DAY_OF_WEEK"; days: number[] }
  | { kind: "MESSAGE_COUNT_MIN"; count: number }
  | { kind: "IS_CLOSED" }
  | { kind: "PHONE_CONTAINS"; text: string }
  | { kind: "NAME_CONTAINS"; text: string }
  | { kind: "ASSIGNEE_IS"; userId: string }
  | { kind: "PLATFORM_IS"; platform: string }
  | { kind: "VAR_EQUALS"; name: string; value: string }
  | { kind: "LAST_OUTBOUND_HOURS"; hours: number };

type IfBranchShape = { condition: IfCondition; steps: Step[] };

// خط مرسوم في طبقة SVG فوق اللوحة: وصل تلقائي أو سهم GOTO
type Wire = {
  key: string;
  kind: "link" | "goto";
  d: string;
  label?: string;
  midX?: number;
  midY?: number;
};

const PLATFORM_LABELS: Record<string, string> = {
  WHATSAPP: "واتساب",
  WIDGET: "ودجت الموقع",
};

// أيام الأسبوع بترتيبها العربي (السبت أولاً) — القيم كما في Date.getDay()
const WEEK_DAYS = [
  { value: 6, label: "السبت" },
  { value: 0, label: "الأحد" },
  { value: 1, label: "الاثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
  { value: 5, label: "الجمعة" },
];

const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  AI: "رد آلي",
  MANUAL: "تحكم بشري",
  HANDED_OFF: "تم التسليم",
};

function dayLabel(value: number): string {
  return WEEK_DAYS.find((d) => d.value === value)?.label ?? String(value);
}

type Props = {
  workflow?: {
    id: string;
    name: string;
    trigger: string;
    triggerConfig: unknown;
    steps: unknown;
    isActive: boolean;
  };
  runs?: RunRow[];
  members: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  dbSources: { id: string; title: string }[];
};

// تعريف أنواع الخطوات: الأيقونة واللون والوصف المعروض في نافذة الإضافة
const STEP_TYPES: {
  type: string;
  label: string;
  description: string;
  icon: typeof Send;
  color: string;
}[] = [
  { type: "SEND_MESSAGE", label: "إرسال رسالة", description: "إرسال رسالة عبر آخر قناة تفاعل", icon: Send, color: "#3b82f6" },
  { type: "SEND_MEDIA", label: "إرسال وسائط", description: "صورة أو فيديو أو PDF برابط مباشر مع تسمية اختيارية", icon: Image, color: "#ec4899" },
  { type: "REQUEST_LOCATION", label: "طلب الموقع", description: "طلب مشاركة موقع العميل مع نص اختياري", icon: MapPin, color: "#10b981" },
  { type: "ASSIGN", label: "إسناد المحادثة لموظف", description: "إسناد المحادثة إلى موظف في الفريق", icon: UserCheck, color: "#f59e0b" },
  { type: "SET_AGENT", label: "تعيين الوكيل", description: "ربط المحادثة بوكيل ذكي محدد", icon: Bot, color: "#7c3aed" },
  { type: "SET_STAGE", label: "تحديث المرحلة", description: "نقل جهة الاتصال إلى مرحلة مختلفة", icon: Flag, color: "#a855f7" },
  { type: "ADD_TAG", label: "إضافة وسم", description: "إضافة وسم جديد لجهة الاتصال", icon: Tag, color: "#14b8a6" },
  { type: "REMOVE_TAG", label: "إزالة وسم", description: "إزالة وسم من جهة الاتصال", icon: Tag, color: "#f43f5e" },
  { type: "ADD_NOTE", label: "إضافة ملاحظة", description: "ملاحظة داخلية على جهة الاتصال", icon: StickyNote, color: "#eab308" },
  { type: "AI_REPLY", label: "رد ذكي", description: "يرد الوكيل بمعرفته المربوطة (ملفات + نصوص + قواعد بيانات)", icon: Bot, color: "#8b5cf6" },
  { type: "SEARCH_KNOWLEDGE", label: "البحث في المعرفة", description: "البحث في قاعدة معرفة الوكيل الحالي", icon: BookOpen, color: "#06b6d4" },
  { type: "QUERY_DB", label: "استعلام قاعدة بيانات", description: "تشغيل استعلام على مصدر بيانات مربوط", icon: Database, color: "#f97316" },
  { type: "STOP_AI", label: "إيقاف الرد الآلي", description: "يحوّل المحادثة للتحكم البشري — لا يردّ الوكيل بعدها", icon: UserCheck, color: "#e11d48" },
  { type: "REOPEN", label: "إعادة فتح المحادثة", description: "إعادة فتح محادثة مغلقة", icon: RotateCcw, color: "#22c55e" },
  { type: "CLOSE", label: "إغلاق المحادثة", description: "إغلاق المحادثة وإخفاءها من الوارد", icon: CheckCheck, color: "#64748b" },
  { type: "CREATE_BOOKING", label: "إنشاء حجز", description: "حجز موعد جديد مع العميل", icon: CalendarPlus, color: "#0ea5e9" },
  { type: "RESUME_AI", label: "إعادة تفعيل الرد الآلي", description: "عكس إيقاف الرد الآلي — يعيد رد الوكيل", icon: Play, color: "#84cc16" },
  { type: "ARCHIVE", label: "أرشفة المحادثة", description: "نقل المحادثة للأرشيف", icon: Archive, color: "#78716c" },
  { type: "UNARCHIVE", label: "إلغاء أرشفة المحادثة", description: "إرجاع المحادثة من الأرشيف", icon: ArchiveRestore, color: "#a8a29e" },
  { type: "MARK_READ", label: "تعليم الرسائل مقروءة", description: "تعليم كل رسائل المحادثة مقروءة", icon: MailOpen, color: "#0d9488" },
  { type: "SET_VAR", label: "تعيين متغير", description: "تخزين قيمة تُستخدم في الشروط والرسائل", icon: Variable, color: "#f472b6" },
  { type: "HTTP_REQUEST", label: "طلب HTTP عام", description: "نداء رابط خارجي — النتيجة في {{http}}", icon: Globe, color: "#0891b2" },
  { type: "AI_CLASSIFY", label: "تصنيف بالذكاء الاصطناعي", description: "تصنيف آخر رسالة إلى أحد الخيارات", icon: ListFilter, color: "#c026d3" },
  { type: "WAIT", label: "انتظار (تأخير)", description: "تأخير قبل متابعة الخطوات التالية", icon: Clock, color: "#f97316" },
  { type: "WEBHOOK", label: "Webhook", description: "إرسال بيانات العميل إلى رابط خارجي", icon: Webhook, color: "#0ea5e9" },
  { type: "GOTO", label: "انتقال إلى خطوة", description: "بعد تنفيذها يقفز سير العمل فوراً إلى الخطوة التي تختارها — يظهر سهم بنفسجي يربطهما على اللوحة. للأمام فقط لمنع التكرار اللانهائي", icon: CornerUpRight, color: "#6366f1" },
  { type: "IF", label: "شرط (إذا)", description: "تفرع الخطوات حسب شرط محدد", icon: GitBranch, color: "#d946ef" },
];

function stepMeta(type: string) {
  return (
    STEP_TYPES.find((s) => s.type === type) ?? {
      type,
      label: type,
      description: "",
      icon: WorkflowIcon,
      color: "#64748b",
    }
  );
}

function emptyStepBase(type: string): Step {
  switch (type) {
    case "SEND_MESSAGE":
      return { type, body: "" };
    case "SEND_MEDIA":
      return { type, url: "", caption: "" };
    case "REQUEST_LOCATION":
      return { type, prompt: "" };
    case "ASSIGN":
      return { type, userId: "any" };
    case "SET_AGENT":
      return { type, agentId: "" };
    case "SET_STAGE":
      return { type, stage: "NEW" };
    case "ADD_TAG":
    case "REMOVE_TAG":
      return { type, tag: "" };
    case "ADD_NOTE":
      return { type, body: "" };
    case "WAIT":
      return { type, minutes: 30 };
    case "WEBHOOK":
      return { type, url: "" };
    case "QUERY_DB":
      return { type, sourceId: "" };
    case "CREATE_BOOKING":
      return { type, title: "", scheduledAt: "", notes: "" };
    case "GOTO":
      return { type, targetId: "" };
    case "SET_VAR":
      return { type, name: "", value: "" };
    case "HTTP_REQUEST":
      return { type, url: "", method: "GET", body: "" };
    case "AI_CLASSIFY":
      return { type, prompt: "", options: [], var: "" };
    case "IF":
      return {
        type,
        branches: [
          {
            condition: { kind: "STAGE", stage: "NEW" } satisfies IfCondition,
            steps: [],
          },
        ],
        elseSteps: [],
      };
    default:
      return { type };
  }
}

// كل خطوة تحمل معرفاً ثابتاً — GOTO يستهدف الخطوات به
function emptyStep(type: string): Step {
  return { ...emptyStepBase(type), id: crypto.randomUUID() };
}

// شرط افتراضي عند تبديل نوع الشرط في محرر IF
function defaultCondition(kind: IfCondition["kind"]): IfCondition {
  switch (kind) {
    case "STAGE":
      return { kind, stage: "NEW" };
    case "HAS_TAG":
      return { kind, tag: "" };
    case "TEXT_CONTAINS":
    case "DB_CONTAINS":
    case "PHONE_CONTAINS":
    case "NAME_CONTAINS":
      return { kind, text: "" };
    case "ASSIGNEE_IS":
      return { kind, userId: "any" };
    case "STATUS_IS":
      return { kind, status: "AI" };
    case "HOURS_BETWEEN":
      return { kind, from: 9, to: 17 };
    case "DAY_OF_WEEK":
      return { kind, days: [] };
    case "MESSAGE_COUNT_MIN":
      return { kind, count: 1 };
    case "VAR_EQUALS":
      return { kind, name: "", value: "" };
    case "LAST_OUTBOUND_HOURS":
      return { kind, hours: 24 };
    default:
      return { kind } as IfCondition;
  }
}

function conditionSummary(
  cond: IfCondition,
  members: { id: string; name: string }[] = []
): string {
  switch (cond.kind) {
    case "STAGE":
      return `حالة العميل = ${stageConfig(cond.stage).label}`;
    case "HAS_TAG":
      return `يحمل الوسم "${cond.tag || "—"}"`;
    case "TEXT_CONTAINS":
      return `الرسالة تحتوي "${cond.text || "—"}"`;
    case "BUSINESS_HOURS":
      return "ضمن ساعات العمل";
    case "DB_CONTAINS":
      return `نتيجة قاعدة البيانات تحتوي "${cond.text || "—"}"`;
    case "HAS_ASSIGNEE":
      return "للمحادثة موظف مسند";
    case "STATUS_IS":
      return `حالة المحادثة: ${CONVERSATION_STATUS_LABELS[cond.status] ?? cond.status}`;
    case "HOURS_BETWEEN":
      return `الساعة بين ${cond.from ?? 0} و${cond.to ?? 23}`;
    case "DAY_OF_WEEK":
      return `أيام: ${(cond.days ?? []).map(dayLabel).join("، ") || "—"}`;
    case "MESSAGE_COUNT_MIN":
      return `عدد رسائل العميل ≥ ${cond.count ?? 1}`;
    case "IS_CLOSED":
      return "المحادثة مغلقة";
    case "PHONE_CONTAINS":
      return `رقم العميل يحتوي "${cond.text || "—"}"`;
    case "NAME_CONTAINS":
      return `اسم العميل يحتوي "${cond.text || "—"}"`;
    case "ASSIGNEE_IS":
      return cond.userId === "any"
        ? "مسندة لأي موظف"
        : `المسند إليه: ${members.find((m) => m.id === cond.userId)?.name ?? "موظف محذوف"}`;
    case "PLATFORM_IS":
      return `القناة: ${PLATFORM_LABELS[cond.platform] ?? cond.platform}`;
    case "VAR_EQUALS":
      return `المتغير ${cond.name || "—"} = "${cond.value || "—"}"`;
    case "LAST_OUTBOUND_HOURS":
      return `مرّت ${cond.hours ?? 24} ساعة على آخر رد منا`;
  }
}

// تحويل IF قديم الشكل ({condition, then, else}) إلى الفروع المتعددة —
// نسخة محلية خالصة من normalizeSteps في lib/workflows (لا تُستورد تلك الوحدة
// هنا لأنها تجذب prisma ووحدات خادم إلى حزمة المتصفح)
function normalizeStepsShape(steps: Step[]): Step[] {
  return steps.map((raw) => {
    const step: Step =
      typeof raw.id === "string" && raw.id ? raw : { ...raw, id: crypto.randomUUID() };
    if (step.type !== "IF") return step;
    if (Array.isArray(step.branches)) {
      return {
        ...step,
        branches: (step.branches as IfBranchShape[]).map((b) => ({
          ...b,
          steps: normalizeStepsShape(Array.isArray(b.steps) ? b.steps : []),
        })),
        elseSteps: normalizeStepsShape(
          Array.isArray(step.elseSteps) ? (step.elseSteps as Step[]) : []
        ),
      };
    }
    return {
      type: "IF",
      branches: [
        {
          condition: (step.condition as IfCondition | undefined) ?? {
            kind: "STAGE",
            stage: "NEW",
          },
          steps: Array.isArray(step.then)
            ? normalizeStepsShape(step.then as Step[])
            : [],
        },
      ],
      elseSteps: Array.isArray(step["else"])
        ? normalizeStepsShape(step["else"] as Step[])
        : [],
    };
  });
}

// ملخص الخطوة المعروض داخل بطاقة العقدة
function stepSummary(step: Step, members: { id: string; name: string }[], templates: { id: string; name: string }[], agents: { id: string; name: string }[] = [], dbSources: { id: string; title: string }[] = [], sameList: Step[] = []): string {
  switch (step.type) {
    case "SEND_MESSAGE": {
      const templateId = step.templateId as string | undefined;
      if (templateId) {
        return `قالب: ${templates.find((t) => t.id === templateId)?.name ?? "غير موجود"}`;
      }
      return ((step.body as string) || "بدون نص").slice(0, 60);
    }
    case "SEND_MEDIA":
      return (
        (step.assetName as string) ||
        (step.caption as string) ||
        ((step.url as string) || "—").slice(0, 50)
      );
    case "REQUEST_LOCATION":
      return (step.prompt as string) || "طلب الموقع من العميل";
    case "ASSIGN":
      return step.userId === "any"
        ? "أول عضو متاح في الفريق"
        : (members.find((m) => m.id === step.userId)?.name ?? "موظف محذوف");
    case "SET_AGENT":
      return agents.find((a) => a.id === step.agentId)?.name ?? "—";
    case "SET_STAGE":
      return `إلى: ${stageConfig((step.stage as string) ?? "NEW").label}`;
    case "ADD_TAG":
    case "REMOVE_TAG":
      return (step.tag as string) || "—";
    case "ADD_NOTE":
      return ((step.body as string) || "—").slice(0, 60);
    case "AI_REPLY":
      return "يرد الوكيل بمعرفته المربوطة";
    case "SEARCH_KNOWLEDGE":
      return "البحث في قاعدة المعرفة";
    case "QUERY_DB":
      return dbSources.find((d) => d.id === step.sourceId)?.title ?? "—";
    case "CLOSE":
      return "تُغلق المحادثة وتختفي من الوارد";
    case "REOPEN":
      return "إعادة فتح المحادثة";
    case "CREATE_BOOKING":
      return (step.title as string) || "حجز جديد";
    case "WAIT":
      return `${step.minutes} دقيقة ثم تُستأنف الخطوات`;
    case "WEBHOOK":
      return ((step.url as string) || "—").slice(0, 50);
    case "GOTO": {
      const target = sameList.find((s) => s.id === step.targetId);
      if (!target || target.type === "GOTO") return "→ خطوة";
      return `→ ${stepSummary(target, members, templates, agents, dbSources, sameList)}`;
    }
    case "RESUME_AI":
      return "إعادة تفعيل الرد الآلي";
    case "ARCHIVE":
      return "أرشفة المحادثة";
    case "UNARCHIVE":
      return "إلغاء أرشفة المحادثة";
    case "MARK_READ":
      return "تعليم الرسائل مقروءة";
    case "SET_VAR":
      return `المتغير ${(step.name as string) || "—"} = "${((step.value as string) || "").slice(0, 30)}"`;
    case "HTTP_REQUEST":
      return `${(step.method as string) ?? "GET"} ${((step.url as string) || "—").slice(0, 40)}`;
    case "AI_CLASSIFY": {
      const options = Array.isArray(step.options) ? (step.options as string[]) : [];
      return `تصنيف (${options.length} خيار) في ${(step.var as string) || "—"}`;
    }
    case "IF": {
      const branches = Array.isArray(step.branches) ? (step.branches as unknown[]) : [];
      const hasElse = Array.isArray(step.elseSteps);
      const n = branches.length;
      const nText =
        n === 1 ? "فرع واحد" : n === 2 ? "فرعان" : `${n} فروع`;
      return `${nText}${hasElse ? " + وإلا" : " بدون وإلا"}`;
    }
    default:
      return "";
  }
}

// محرّر سير العمل المرئي: canvas منقّط ببطاقات متصلة + نوافذ منبثقة
export function WorkflowBuilder({ workflow, runs, members, templates, agents, dbSources }: Props) {
  const router = useRouter();
  const isEdit = Boolean(workflow);

  const [name, setName] = useState(workflow?.name ?? "");
  const [trigger, setTrigger] = useState(workflow?.trigger ?? "KEYWORD");
  const [keywords, setKeywords] = useState<string[]>(
    ((workflow?.triggerConfig as { keywords?: string[] })?.keywords ?? [])
  );
  const [phones, setPhones] = useState<string[]>(
    ((workflow?.triggerConfig as { phones?: string[] })?.phones ?? [])
  );
  const [fromStage, setFromStage] = useState(
    (workflow?.triggerConfig as { fromStage?: string })?.fromStage ?? ""
  );
  const [toStage, setToStage] = useState(
    (workflow?.triggerConfig as { toStage?: string })?.toStage ?? "NEW"
  );
  const [noReplyHours, setNoReplyHours] = useState<number>(
    (workflow?.triggerConfig as { hours?: number })?.hours ?? 24
  );
  const [steps, setSteps] = useState<Step[]>(() =>
    normalizeStepsShape(
      Array.isArray(workflow?.steps) ? (workflow!.steps as Step[]) : []
    )
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // نافذة الإضافة/التعديل: null مغلقة، وإلا مسار قائمة (إضافة) أو مسار خطوة (تعديل)
  const [editor, setEditor] = useState<{ path: number[]; isNew: boolean } | null>(null);
  // لوحة الشروط الجانبية
  const [conditionsOpen, setConditionsOpen] = useState(false);

  const editingStep =
    editor && !editor.isNew ? getStepAtPath(steps, editor.path) : null;
  // إبراز بطاقة هدف GOTO طالما محررها مفتوح
  const editingTargetId =
    editingStep?.type === "GOTO"
      ? (editingStep.targetId as string | undefined)
      : undefined;

  // تتبّع مسار قائمة: أزواج (فهرس خطوة، فهرس فرع) نزولاً من المستوى الأعلى.
  // فهرس الفرع b يشير إلى branches[b]، وb === branches.length يعني elseSteps
  function getListAtPath(root: Step[], path: number[]): Step[] {
    let list = root;
    for (let k = 0; k < path.length; k += 2) {
      const step = list[path[k]];
      if (!step) return [];
      list = branchListOf(step, path[k + 1]);
    }
    return list;
  }

  function getStepAtPath(root: Step[], path: number[]): Step | null {
    const list = getListAtPath(root, path.slice(0, -1));
    return list[path[path.length - 1]] ?? null;
  }

  function branchCountOf(step: Step): number {
    return Array.isArray(step.branches) ? (step.branches as unknown[]).length : 0;
  }

  function branchListOf(step: Step, b: number): Step[] {
    if (b < branchCountOf(step)) {
      const branch = (step.branches as IfBranchShape[])[b];
      return Array.isArray(branch?.steps) ? (branch.steps as Step[]) : [];
    }
    return Array.isArray(step.elseSteps) ? (step.elseSteps as Step[]) : [];
  }

  function replaceBranchList(step: Step, b: number, list: Step[]): Step {
    if (b < branchCountOf(step)) {
      return {
        ...step,
        branches: (step.branches as IfBranchShape[]).map((br, j) =>
          j === b ? { ...br, steps: list } : br
        ),
      };
    }
    return { ...step, elseSteps: list };
  }

  function updateStepAtPath(root: Step[], path: number[], patch: Partial<Step>): Step[] {
    const index = path[0];
    if (path.length === 1) {
      return root.map((s, i) => (i === index ? { ...s, ...patch } : s));
    }
    const [branch, ...rest] = path.slice(1);
    return root.map((s, i) =>
      i === index
        ? replaceBranchList(
            s,
            branch,
            updateStepAtPath(branchListOf(s, branch), rest, patch)
          )
        : s
    );
  }

  function addStepAtPath(root: Step[], listPath: number[], step: Step): Step[] {
    if (listPath.length === 0) return [...root, step];
    const [index, branch, ...rest] = listPath;
    return root.map((s, i) =>
      i === index
        ? replaceBranchList(s, branch, addStepAtPath(branchListOf(s, branch), rest, step))
        : s
    );
  }

  function removeStepAtPath(root: Step[], path: number[]): Step[] {
    const index = path[0];
    if (path.length === 1) return root.filter((_, i) => i !== index);
    const [branch, ...rest] = path.slice(1);
    return root.map((s, i) =>
      i === index
        ? replaceBranchList(s, branch, removeStepAtPath(branchListOf(s, branch), rest))
        : s
    );
  }

  function replaceListAtPath(root: Step[], listPath: number[], list: Step[]): Step[] {
    if (listPath.length === 0) return list;
    const [index, branch, ...rest] = listPath;
    return root.map((s, i) =>
      i === index
        ? replaceBranchList(
            s,
            branch,
            replaceListAtPath(branchListOf(s, branch), rest, list)
          )
        : s
    );
  }

  // سحب وإفلات: نقل خطوة لتسبق بطاقة الهدف — بين القوائم أو ضمن نفسها
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // سحب حر يدوي بمقبض — إزاحة بصرية تراكمية فوق موضع الخطوة (pos)
  const [freeDrag, setFreeDrag] = useState<{
    key: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    x: number;
    y: number;
  } | null>(null);

  function isInsideOwnBranches(srcPath: number[], targetPath: number[]): boolean {
    const src = srcPath.join(",");
    const tgt = targetPath.join(",");
    return tgt === src || tgt.startsWith(src + ",");
  }

  // تصحيح مسار قائمة بعد حذف عنصر من قائمة المصدر: أي فهرس زوجي في المسار
  // يشير إلى قائمة المصدر وكان بعد العنصر المحذوف يتقدم بمقدار واحد
  function adjustListPathForRemoval(
    listPath: number[],
    srcListPath: number[],
    srcIndex: number
  ): number[] {
    const srcKey = srcListPath.join(",");
    const result = [...listPath];
    for (let d = 0; d + 1 < result.length; d += 2) {
      if (result.slice(0, d).join(",") === srcKey && result[d] > srcIndex) {
        result[d] -= 1;
      }
    }
    return result;
  }

  function moveStepBefore(srcPath: number[], targetPath: number[]) {
    if (srcPath.join(",") === targetPath.join(",")) return;
    if (isInsideOwnBranches(srcPath, targetPath)) return;
    setSteps((prev) => {
      const step = getStepAtPath(prev, srcPath);
      if (!step) return prev;
      const srcListPath = srcPath.slice(0, -1);
      const tgtListPath = targetPath.slice(0, -1);
      const srcIndex = srcPath[srcPath.length - 1];
      let tgtIndex = targetPath[targetPath.length - 1];
      const next = removeStepAtPath(prev, srcPath);
      const adjustedTgtListPath = adjustListPathForRemoval(
        tgtListPath,
        srcListPath,
        srcIndex
      );
      // الهدف في قائمة المصدر نفسها: فهرسه يتقدم إذا كان المصدر قبله
      if (
        adjustedTgtListPath.join(",") === srcListPath.join(",") &&
        srcIndex < tgtIndex
      ) {
        tgtIndex -= 1;
      }
      const list = getListAtPath(next, adjustedTgtListPath);
      return replaceListAtPath(next, adjustedTgtListPath, [
        ...list.slice(0, tgtIndex),
        step,
        ...list.slice(tgtIndex),
      ]);
    });
  }

  function moveStepToEnd(srcPath: number[], listPath: number[]) {
    if (isInsideOwnBranches(srcPath, listPath)) return;
    setSteps((prev) => {
      const step = getStepAtPath(prev, srcPath);
      if (!step) return prev;
      const next = removeStepAtPath(prev, srcPath);
      const adjusted = adjustListPathForRemoval(
        listPath,
        srcPath.slice(0, -1),
        srcPath[srcPath.length - 1]
      );
      const list = getListAtPath(next, adjusted);
      return replaceListAtPath(next, adjusted, [...list, step]);
    });
  }

  // رفع ملف وسائط لخطوة SEND_MEDIA
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function uploadAsset(file: File, apply: (patch: Partial<Step>) => void) {
    setUploading(true);
    setUploadError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/assets", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        setUploadError(data?.error ?? "فشل الرفع — حاول مجدداً");
        return;
      }
      apply({ assetId: data.id, assetName: data.filename, assetMime: data.mime, url: "" });
    } catch {
      setUploadError("فشل الرفع — تحقق من الاتصال");
    } finally {
      setUploading(false);
    }
  }

  // خطوط الوصل والأسهم: طبقة SVG فوق البطاقات — تتبع الإحداثيات الفعلية بعد transform
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [wires, setWires] = useState<Wire[]>([]);

  const drawWires = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const next: Wire[] = [];
    const px = (v: number) => Math.round(v * 10) / 10;

    const point = (
      el: HTMLElement,
      vert: "top" | "bottom" | "mid"
    ): [number, number] => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2 - cRect.left;
      const y =
        vert === "top"
          ? r.top - cRect.top
          : vert === "bottom"
            ? r.bottom - cRect.top
            : r.top + r.height / 2 - cRect.top;
      return [px(x), px(y)];
    };

    const pushLink = (
      key: string,
      src: HTMLElement | undefined,
      tgt: HTMLElement | undefined,
      from: "bottom" | "mid" = "bottom",
      to: "top" | "mid" = "top"
    ) => {
      if (!src || !tgt) return;
      const [x1, y1] = point(src, from);
      const [x2, y2] = point(tgt, to);
      next.push({ key, kind: "link", d: `M ${x1} ${y1} L ${x2} ${y2}` });
    };

    const cardEl = (p: number[]) => cardRefs.current.get(p.join(","));

    // المحفّز → أول بطاقة في السلسلة الرئيسية
    if (steps.length > 0) {
      pushLink("trigger-first", cardRefs.current.get("trigger"), cardRefs.current.get("0"));
    }

    function walk(listPath: number[]) {
      const list = getListAtPath(steps, listPath);
      // وصل متتالي بين البطاقات
      for (let i = 0; i + 1 < list.length; i++) {
        pushLink(
          `chain-${[...listPath, i].join(",")}`,
          cardEl([...listPath, i]),
          cardEl([...listPath, i + 1])
        );
      }
      list.forEach((s, i) => {
        if (s.type !== "IF") return;
        const count = branchCountOf(s);
        const elseOn = Array.isArray(s.elseSteps);
        const total = count + (elseOn ? 1 : 0);
        const ifEl = cardEl([...listPath, i]);
        const nextEl = i + 1 < list.length ? cardEl([...listPath, i + 1]) : undefined;
        for (let b = 0; b < total; b++) {
          const bPath = [...listPath, i, b];
          const hEl = cardRefs.current.get(`${bPath.join(",")}:h`);
          // IF → ترويسة الفرع
          pushLink(`if-${bPath.join(",")}`, ifEl, hEl, "bottom", "mid");
          // دمج الفرع: آخر بطاقة فيه (أو ترويسته إن فارغ) → البطاقة التالية بعد IF
          const bList = branchListOf(s, b);
          const mergeSrc = bList.length > 0 ? cardEl([...bPath, bList.length - 1]) : hEl;
          pushLink(`merge-${bPath.join(",")}`, mergeSrc, nextEl);
          walk(bPath);
        }
      });
    }
    walk([]);

    // أسهم GOTO المصمتة مع تسمية "انتقال" على منتصف المسار
    const pairs: { src: number[]; tgt: number[] }[] = [];
    function walkGotos(listPath: number[]) {
      const list = getListAtPath(steps, listPath);
      list.forEach((s, i) => {
        if (s.type === "IF") {
          const count = branchCountOf(s);
          for (let b = 0; b < count; b++) walkGotos([...listPath, i, b]);
          if (Array.isArray(s.elseSteps)) walkGotos([...listPath, i, count]);
        }
        const targetId = s.targetId as string | undefined;
        if (s.type === "GOTO" && typeof targetId === "string" && targetId) {
          const t = list.findIndex((x) => x.id === targetId);
          if (t >= 0) pairs.push({ src: [...listPath, i], tgt: [...listPath, t] });
        }
      });
    }
    walkGotos([]);

    for (const { src, tgt } of pairs) {
      const srcEl = cardEl(src);
      const tgtEl = cardEl(tgt);
      if (!srcEl || !tgtEl) continue;
      const [x1, y1] = point(srcEl, "bottom");
      const [x2, y2] = point(tgtEl, "top");
      const dy = Math.max((y2 - y1) / 2, 24);
      const cx1 = x1;
      const cy1 = y1 + dy;
      const cx2 = x2;
      const cy2 = y2 - dy;
      next.push({
        key: `goto-${src.join(",")}`,
        kind: "goto",
        d: `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`,
        label: "انتقال",
        midX: px((x1 + 3 * cx1 + 3 * cx2 + x2) / 8),
        midY: px((y1 + 3 * cy1 + 3 * cy2 + y2) / 8) - 6,
      });
    }

    setWires(next);
  }, [steps]);

  useLayoutEffect(() => {
    drawWires();
  }, [drawWires]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => drawWires();
    container.addEventListener("scroll", onScroll);
    const ro = new ResizeObserver(() => drawWires());
    ro.observe(container);
    return () => {
      container.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [drawWires]);

  function addKeyword() {
    const k = keywordInput.trim();
    if (!k || keywords.includes(k)) return;
    setKeywords([...keywords, k]);
    setKeywordInput("");
  }

  function triggerSummary(): string {
    if (trigger === "KEYWORD") return keywords.join("، ") || "—";
    if (trigger === "FROM_NUMBERS") return `${phones.length} رقم محدد`;
    if (trigger === "STAGE_CHANGE") {
      const from = fromStage ? stageConfig(fromStage).label : "أي حالة";
      return `${from} ← ${stageConfig(toStage).label}`;
    }
    if (trigger === "NO_REPLY") return `بعد ${noReplyHours} ساعة من صمت العميل`;
    return "أول رسالة من عميل جديد";
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    const triggerConfig: Record<string, unknown> =
      trigger === "KEYWORD"
        ? { keywords }
        : trigger === "FROM_NUMBERS"
          ? { phones }
          : trigger === "STAGE_CHANGE"
            ? { toStage, ...(fromStage ? { fromStage } : {}) }
            : trigger === "NO_REPLY"
              ? { hours: noReplyHours }
              : {};

    const payload = { name, trigger, triggerConfig, steps };
    const res = await fetch(
      isEdit ? `/api/workflows/${workflow!.id}` : "/api/workflows",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء الحفظ");
      return;
    }
    router.push("/workflows");
    router.refresh();
  }

  // حقول إعداد الخطوة داخل النافذة المنبثقة
  function stepFields(step: Step, path: number[]) {
    const update = (patch: Partial<Step>) =>
      setSteps((prev) => updateStepAtPath(prev, path, patch));

    // محرّر شرط واحد: نوع الشرط + حقوله — يُستخدم لكل فرع في خطوة IF
    function conditionEditor(
      cond: IfCondition,
      setCond: (next: IfCondition) => void
    ) {
      const patchCond = (patch: Partial<IfCondition>) =>
        setCond({ ...cond, ...patch } as IfCondition);
      const days = cond.kind === "DAY_OF_WEEK" ? (cond.days ?? []) : [];
      const toggleDay = (value: number) =>
        patchCond({
          days: days.includes(value)
            ? days.filter((d) => d !== value)
            : [...days, value],
        });
      return (
        <div className="space-y-1.5">
          <select
            value={cond.kind}
            onChange={(e) =>
              setCond(defaultCondition(e.target.value as IfCondition["kind"]))
            }
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="STAGE">حالة العميل</option>
            <option value="HAS_TAG">يحمل الوسم</option>
            <option value="TEXT_CONTAINS">الرسالة تحتوي</option>
            <option value="BUSINESS_HOURS">ضمن ساعات العمل</option>
            <option value="DB_CONTAINS">نتيجة قاعدة البيانات تحتوي</option>
            <option value="HAS_ASSIGNEE">لها موظف مسند</option>
            <option value="STATUS_IS">حالة المحادثة</option>
            <option value="HOURS_BETWEEN">الساعة بين وقتين</option>
            <option value="DAY_OF_WEEK">يوم الأسبوع</option>
            <option value="MESSAGE_COUNT_MIN">عدد رسائل العميل</option>
            <option value="IS_CLOSED">المحادثة مغلقة</option>
            <option value="PHONE_CONTAINS">رقم العميل يحتوي</option>
            <option value="NAME_CONTAINS">اسم العميل يحتوي</option>
            <option value="ASSIGNEE_IS">المسند إليه هو</option>
            <option value="PLATFORM_IS">قناة المحادثة</option>
            <option value="VAR_EQUALS">متغير يساوي</option>
            <option value="LAST_OUTBOUND_HOURS">ساعات منذ آخر رد منا</option>
          </select>
          {cond.kind === "STAGE" && (
            <select
              value={cond.stage}
              onChange={(e) => patchCond({ stage: e.target.value })}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {CONTACT_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {cond.kind === "HAS_TAG" && (
            <Input
              value={cond.tag}
              onChange={(e) => patchCond({ tag: e.target.value })}
              placeholder="الوسم المطلوب"
            />
          )}
          {(cond.kind === "TEXT_CONTAINS" ||
            cond.kind === "DB_CONTAINS" ||
            cond.kind === "PHONE_CONTAINS" ||
            cond.kind === "NAME_CONTAINS") && (
            <Input
              value={cond.text}
              onChange={(e) => patchCond({ text: e.target.value })}
              placeholder="النص المطلوب"
            />
          )}
          {cond.kind === "BUSINESS_HOURS" && (
            <p className="text-xs text-muted-foreground">
              يُضبط من صفحة التكاملات: ساعات العمل
            </p>
          )}
          {cond.kind === "HAS_ASSIGNEE" && (
            <p className="text-xs text-muted-foreground">
              يتحقق إذا وُجد موظف مسند للمحادثة
            </p>
          )}
          {cond.kind === "STATUS_IS" && (
            <select
              value={cond.status}
              onChange={(e) => patchCond({ status: e.target.value })}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {Object.entries(CONVERSATION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
          {cond.kind === "HOURS_BETWEEN" && (
            <div className="flex items-start gap-2">
              <div className="space-y-1">
                <Label className="text-xs">من ساعة</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={cond.from ?? 0}
                  onChange={(e) =>
                    patchCond({
                      from: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-20"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">إلى ساعة</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={cond.to ?? 23}
                  onChange={(e) =>
                    patchCond({
                      to: Math.min(23, Math.max(0, Number(e.target.value) || 23)),
                    })
                  }
                  className="w-20"
                  dir="ltr"
                />
              </div>
            </div>
          )}
          {cond.kind === "DAY_OF_WEEK" && (
            <div className="flex flex-wrap gap-1.5">
              {WEEK_DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    days.includes(d.value)
                      ? "border-primary bg-accent font-medium"
                      : "hover:bg-muted"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
          {cond.kind === "MESSAGE_COUNT_MIN" && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={cond.count ?? 1}
                onChange={(e) =>
                  patchCond({ count: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-24"
                dir="ltr"
              />
              <span className="text-xs text-muted-foreground">رسالة أو أكثر</span>
            </div>
          )}
          {cond.kind === "IS_CLOSED" && (
            <p className="text-xs text-muted-foreground">
              يتحقق إذا كانت المحادثة مغلقة
            </p>
          )}
          {cond.kind === "ASSIGNEE_IS" && (
            <select
              value={cond.userId ?? "any"}
              onChange={(e) => patchCond({ userId: e.target.value })}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="any">أي موظف</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {cond.kind === "PLATFORM_IS" && (
            <select
              value={cond.platform ?? "WHATSAPP"}
              onChange={(e) => patchCond({ platform: e.target.value })}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
          {cond.kind === "VAR_EQUALS" && (
            <div className="flex items-center gap-2">
              <Input
                value={cond.name ?? ""}
                onChange={(e) => patchCond({ name: e.target.value })}
                placeholder="اسم المتغير"
                dir="ltr"
              />
              <Input
                value={cond.value ?? ""}
                onChange={(e) => patchCond({ value: e.target.value })}
                placeholder="القيمة"
              />
            </div>
          )}
          {cond.kind === "LAST_OUTBOUND_HOURS" && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={cond.hours ?? 24}
                onChange={(e) =>
                  patchCond({ hours: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-24"
                dir="ltr"
              />
              <span className="text-xs text-muted-foreground">ساعة على الأقل منذ آخر رد منا</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3 border-t pt-3">
        {step.type === "SEND_MESSAGE" && (
          <>
            {templates.length > 0 && (
              <select
                value={(step.templateId as string) ?? ""}
                onChange={(e) =>
                  update({ templateId: e.target.value || undefined })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">رسالة نصية (بدون قالب)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    قالب: {t.name}
                  </option>
                ))}
              </select>
            )}
            <Textarea
              value={(step.body as string) ?? ""}
              onChange={(e) => update({ body: e.target.value })}
              placeholder="نص الرسالة… {{name}} تُستبدل باسم العميل"
              rows={3}
            />
          </>
        )}
        {step.type === "ASSIGN" && (
          <select
            value={(step.userId as string) ?? "any"}
            onChange={(e) => update({ userId: e.target.value })}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="any">أول عضو متاح في الفريق</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {step.type === "SET_STAGE" && (
          <select
            value={(step.stage as string) ?? "NEW"}
            onChange={(e) => update({ stage: e.target.value })}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {CONTACT_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        {step.type === "ADD_TAG" && (
          <Input
            value={(step.tag as string) ?? ""}
            onChange={(e) => update({ tag: e.target.value })}
            placeholder="مثال: متابعة"
          />
        )}
        {step.type === "WAIT" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={(step.minutes as number) ?? 30}
              onChange={(e) =>
                update({ minutes: Number(e.target.value) || 1 })
              }
              className="w-28"
              dir="ltr"
            />
            <span className="text-sm text-muted-foreground">دقيقة</span>
          </div>
        )}
        {step.type === "WEBHOOK" && (
          <Input
            value={(step.url as string) ?? ""}
            onChange={(e) => update({ url: e.target.value })}
            placeholder="https://example.com/hook"
            dir="ltr"
          />
        )}
        {step.type === "SEND_MEDIA" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant={!step.url ? "secondary" : "outline"}
                size="sm"
                onClick={() =>
                  update({ url: "" })
                }
              >
                رفع ملف
              </Button>
              <Button
                variant={step.url ? "secondary" : "outline"}
                size="sm"
                onClick={() =>
                  update({ url: (step.url as string) ?? "", assetId: undefined, assetName: undefined, assetMime: undefined })
                }
              >
                رابط مباشر
              </Button>
            </div>
            {(step.assetId as string) ? (
              <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
                {(step.assetMime as string)?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/assets/${step.assetId}`}
                    alt={(step.assetName as string) ?? ""}
                    className="max-h-36 rounded-md"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    ملف: {(step.assetName as string) ?? "—"}
                  </p>
                )}
                <div className="flex items-center gap-1.5">
                  <p className="flex-1 truncate text-xs text-muted-foreground" dir="ltr">
                    {(step.assetName as string) ?? ""}
                  </p>
                  <button
                    type="button"
                    title="إزالة الملف"
                    onClick={() =>
                      update({ assetId: undefined, assetName: undefined, assetMime: undefined })
                    }
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : step.url ? (
              <Input
                value={(step.url as string) ?? ""}
                onChange={(e) => update({ url: e.target.value })}
                placeholder="https://… (رابط مباشر لصورة/فيديو/PDF)"
                dir="ltr"
              />
            ) : (
              <div className="space-y-1.5">
                <Input
                  type="file"
                  accept="image/*,video/*,audio/*,application/pdf"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadAsset(file, update);
                    e.target.value = "";
                  }}
                />
                {uploading && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    جارٍ الرفع…
                  </p>
                )}
                {uploadError && (
                  <p className="text-xs text-red-600" role="alert">
                    {uploadError}
                  </p>
                )}
              </div>
            )}
            <Input
              value={(step.caption as string) ?? ""}
              onChange={(e) => update({ caption: e.target.value })}
              placeholder="تسمية اختيارية للوسائط"
            />
          </div>
        )}
        {step.type === "REQUEST_LOCATION" && (
          <Input
            value={(step.prompt as string) ?? ""}
            onChange={(e) => update({ prompt: e.target.value })}
            placeholder="نص يطلب فيه موقع العميل (اختياري)"
          />
        )}
        {step.type === "SET_AGENT" && (
          <select
            value={(step.agentId as string) ?? ""}
            onChange={(e) => update({ agentId: e.target.value })}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">اختر وكيلاً…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        {step.type === "REMOVE_TAG" && (
          <Input
            value={(step.tag as string) ?? ""}
            onChange={(e) => update({ tag: e.target.value })}
            placeholder="مثال: متابعة"
          />
        )}
        {step.type === "ADD_NOTE" && (
          <Textarea
            value={(step.body as string) ?? ""}
            onChange={(e) => update({ body: e.target.value })}
            placeholder="ملاحظة داخلية عن العميل…"
            rows={3}
          />
        )}
        {step.type === "QUERY_DB" && (
          <select
            value={(step.sourceId as string) ?? ""}
            onChange={(e) => update({ sourceId: e.target.value })}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">اختر مصدر بيانات…</option>
            {dbSources.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        )}
        {step.type === "CREATE_BOOKING" && (
          <>
            <Input
              value={(step.title as string) ?? ""}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="عنوان الحجز"
            />
            <Input
              type="datetime-local"
              value={(step.scheduledAt as string) ?? ""}
              onChange={(e) => update({ scheduledAt: e.target.value })}
              dir="ltr"
            />
            <Textarea
              value={(step.notes as string) ?? ""}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="ملاحظات (اختياري)"
              rows={2}
            />
          </>
        )}
        {step.type === "GOTO" && (
          <div className="space-y-1.5">
            <div className="space-y-1">
              <Label>انتقال إلى خطوة</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                هذه الخطوة لا ترسل شيئاً للعميل — بل تنقل التنفيذ إلى خطوة أخرى.
                اختر الهدف من نفس المستوى، وسترى سهماً بنفسجياً يربطهما.
              </p>
            </div>
            <select
              value={(step.targetId as string) ?? ""}
              onChange={(e) => update({ targetId: e.target.value || undefined })}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">اختر الخطوة الهدف…</option>
              {getListAtPath(steps, path.slice(0, -1))
                .map((s, idx) => ({ s, idx }))
                .filter(({ s }) => s.type !== "GOTO")
                .map(({ s, idx }) => (
                  <option key={(s.id as string) ?? idx} value={(s.id as string) ?? ""}>
                    #{idx + 1} —{" "}
                    {stepSummary(s, members, templates, agents, dbSources)}
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
              قفزة إلى خطوة لاحقة في نفس المستوى فقط
            </p>
          </div>
        )}
        {step.type === "SET_VAR" && (
          <>
            <Input
              value={(step.name as string) ?? ""}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="اسم المتغير (إنجليزي بدون مسافات)"
              dir="ltr"
            />
            <Input
              value={(step.value as string) ?? ""}
              onChange={(e) => update({ value: e.target.value })}
              placeholder="القيمة — تدعم {{name}} و{{var:الاسم}}"
            />
          </>
        )}
        {step.type === "HTTP_REQUEST" && (
          <>
            <Input
              value={(step.url as string) ?? ""}
              onChange={(e) => update({ url: e.target.value })}
              placeholder="https://example.com/api"
              dir="ltr"
            />
            <select
              value={(step.method as string) ?? "GET"}
              onChange={(e) => update({ method: e.target.value })}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
            {((step.method as string) ?? "GET") === "POST" && (
              <Textarea
                value={(step.body as string) ?? ""}
                onChange={(e) => update({ body: e.target.value })}
                placeholder="جسم الطلب (JSON أو نص) — اختياري"
                rows={3}
                dir="ltr"
              />
            )}
            <p className="text-xs text-muted-foreground">
              تُخزَّن استجابة الطلب في المتغير {"{{http}}"}
            </p>
          </>
        )}
        {step.type === "AI_CLASSIFY" && (
          <>
            <Textarea
              value={(step.prompt as string) ?? ""}
              onChange={(e) => update({ prompt: e.target.value })}
              placeholder="تعليمات تصنيف اختيارية — سياق يساعد الوكيل على التصنيف"
              rows={2}
            />
            <div className="space-y-1">
              <Label className="text-xs">الخيارات (سطر لكل خيار)</Label>
              <Textarea
                value={
                  Array.isArray(step.options) ? (step.options as string[]).join("\n") : ""
                }
                onChange={(e) =>
                  update({
                    options: e.target.value
                      .split("\n")
                      .map((o) => o.trim())
                      .filter(Boolean),
                  })
                }
                rows={4}
                placeholder={"مهتم\nغير مهتم\nيحتاج متابعة"}
              />
            </div>
            <Input
              value={(step.var as string) ?? ""}
              onChange={(e) => update({ var: e.target.value })}
              placeholder="اسم المتغير الناتج (إنجليزي)"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              يُصنَّف آخر رسالة إلى أحد الخيارات ويُخزَّن في المتغير
            </p>
          </>
        )}
        {step.type === "IF" &&
          (() => {
            const branches = Array.isArray(step.branches)
              ? (step.branches as IfBranchShape[])
              : [];
            const elseEnabled = Array.isArray(step.elseSteps);
            const setBranchCond = (i: number, condition: IfCondition) =>
              update({
                branches: branches.map((b, j) => (j === i ? { ...b, condition } : b)),
              });
            return (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  يُنفَّذ أول فرع متحقق ثم يتجاوز الباقي — عدّل خطوات كل فرع مباشرةً على
                  اللوحة.
                </p>
                {branches.map((b, i) => (
                  <div key={i} className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">
                        {i === 0 ? "الشرط 1 (إذا)" : `الشرط ${i + 1} (وإلا إذا)`}
                      </Label>
                      {branches.length > 1 && (
                        <button
                          type="button"
                          title="حذف الفرع"
                          onClick={() =>
                            update({ branches: branches.filter((_, j) => j !== i) })
                          }
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {conditionEditor(
                      b.condition ?? { kind: "STAGE", stage: "NEW" },
                      (c) => setBranchCond(i, c)
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  {branches.length < 10 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        update({
                          branches: [
                            ...branches,
                            {
                              condition: { kind: "STAGE", stage: "NEW" } satisfies IfCondition,
                              steps: [],
                            },
                          ],
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      إضافة وإلا إذا
                    </Button>
                  )}
                  <Button
                    variant={elseEnabled ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => update({ elseSteps: elseEnabled ? undefined : [] })}
                  >
                    {elseEnabled ? "إلغاء فرع وإلا" : "تفعيل فرع وإلا"}
                  </Button>
                </div>
              </div>
            );
          })()}
        {(step.type === "AI_REPLY" || step.type === "CLOSE" || step.type === "STOP_AI") && (
          <p className="text-xs text-muted-foreground">
            {step.type === "AI_REPLY"
              ? "يرد الوكيل بمعرفته المربوطة (ملفات + نصوص + قواعد بيانات)"
              : step.type === "STOP_AI"
                ? "يحوّل المحادثة للتحكم البشري — لا يردّ الوكيل بعدها"
                : "تُغلق المحادثة وتختفي من الوارد"}
          </p>
        )}
        {(step.type === "REOPEN" || step.type === "SEARCH_KNOWLEDGE") && (
          <p className="text-xs text-muted-foreground">
            {step.type === "REOPEN"
              ? "إعادة فتح المحادثة وإرجاعها للوارد"
              : "يبحث الوكيل الحالي في قاعدة معرفته المربوطة"}
          </p>
        )}
        {(step.type === "RESUME_AI" ||
          step.type === "ARCHIVE" ||
          step.type === "UNARCHIVE" ||
          step.type === "MARK_READ") && (
          <p className="text-xs text-muted-foreground">
            {step.type === "RESUME_AI"
              ? "عكس إيقاف الرد الآلي — يعيد تفعيل رد الوكيل على المحادثة"
              : step.type === "ARCHIVE"
                ? "نقل المحادثة إلى الأرشيف"
                : step.type === "UNARCHIVE"
                  ? "إرجاع المحادثة من الأرشيف إلى الوارد"
                  : "تعليم كل رسائل المحادثة كمقروءة"}
          </p>
        )}
      </div>
    );
  }

  // سلسلة خطوات عمودية داخل مسار — كل خطوة IF تفرّع لأعمدة فروعها مثل n8n
  function StepChain({ listPath }: { listPath: number[] }) {
    const list = getListAtPath(steps, listPath);
    return (
      <>
        {list.map((step, i) => {
          const meta = stepMeta(step.type);
          const stepPath = [...listPath, i];
          const key = stepPath.join(",");
          const pos = (step.pos as { x?: number; y?: number } | undefined) ?? {};
          const posX = Number(pos.x) || 0;
          const posY = Number(pos.y) || 0;
          const isFreeDragging = freeDrag?.key === key;
          return (
            <div key={i} className="flex w-full flex-col items-center">
              <div className="h-6 w-px" />
              <div
                ref={(el) => {
                  if (el) cardRefs.current.set(key, el);
                  else cardRefs.current.delete(key);
                }}
                draggable={!isFreeDragging}
                onDragStart={(e) => {
                  if (freeDrag) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData("text/plain", key);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDropTarget(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropTarget(key);
                }}
                onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  const src = e.dataTransfer.getData("text/plain");
                  setDropTarget(null);
                  if (src) moveStepBefore(src.split(",").map(Number), stepPath);
                }}
                className={`relative w-full rounded-xl border-2 transition-[transform,border-color] duration-150 ${
                  dropTarget === key
                    ? "border-blue-500 border-dashed"
                    : "border-blue-400"
                } ${
                  step.id && step.id === editingTargetId
                    ? "ring-2 ring-[#6366f1]"
                    : ""
                }`}
                style={{
                  transform:
                    isFreeDragging || posX || posY
                      ? `translate(${isFreeDragging ? freeDrag.x : posX}px, ${
                          isFreeDragging ? freeDrag.y : posY
                        }px)`
                      : undefined,
                  transition: isFreeDragging ? "none" : undefined,
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditor({ path: stepPath, isNew: false })}
                  className="w-full cursor-grab rounded-[10px] bg-background p-4 text-start shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      الخطوة {i + 1}
                    </span>
                    <meta.icon className="h-4 w-4" style={{ color: meta.color }} />
                  </div>
                  <p className="mt-1 font-medium">{meta.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {stepSummary(step, members, templates, agents, dbSources, list)}
                  </p>
                  <p className="mt-2 text-xs text-blue-500">انقر للتعديل</p>
                </button>
                <button
                  type="button"
                  title="تحريك حر — اسحب لإزاحة البطاقة"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setFreeDrag({
                      key,
                      startX: e.clientX,
                      startY: e.clientY,
                      origX: posX,
                      origY: posY,
                      x: posX,
                      y: posY,
                    });
                  }}
                  onPointerMove={(e) => {
                    if (!freeDrag || freeDrag.key !== key) return;
                    const x = freeDrag.origX + e.clientX - freeDrag.startX;
                    const y = freeDrag.origY + e.clientY - freeDrag.startY;
                    setFreeDrag({ ...freeDrag, x, y });
                    requestAnimationFrame(() => drawWires());
                  }}
                  onPointerUp={(e) => {
                    if (!freeDrag || freeDrag.key !== key) return;
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                    const { x, y } = freeDrag;
                    setFreeDrag(null);
                    setSteps((prev) =>
                      updateStepAtPath(prev, stepPath, {
                        pos: { x: Math.round(x), y: Math.round(y) },
                      })
                    );
                  }}
                  className="absolute -start-2 -top-2 cursor-grab rounded-full border bg-background p-1 text-muted-foreground shadow-sm transition-colors hover:text-foreground active:cursor-grabbing"
                >
                  <GripVertical className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setSteps((prev) => removeStepAtPath(prev, stepPath))}
                  title="حذف الخطوة"
                  className="absolute -end-2 -top-2 rounded-full border bg-background p-1 text-muted-foreground shadow-sm transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {step.type === "IF" &&
                (() => {
                  const count = branchCountOf(step);
                  const elseOn = Array.isArray(step.elseSteps);
                  const total = count + (elseOn ? 1 : 0);
                  return (
                    <div
                      className={`flex w-full min-w-max flex-row items-start justify-center gap-4${
                        total > 3 ? " flex-wrap" : ""
                      }`}
                    >
                      {Array.from({ length: count }, (_, b) => (
                        <BranchColumn
                          key={b}
                          listPath={[...listPath, i, b]}
                          title={b === 0 ? "إذا" : "وإلا إذا"}
                          tone={b === 0 ? "green" : "amber"}
                        />
                      ))}
                      {elseOn && (
                        <BranchColumn
                          listPath={[...listPath, i, count]}
                          title="وإلا"
                          tone="red"
                        />
                      )}
                    </div>
                  );
                })()}
            </div>
          );
        })}
      </>
    );
  }

  // عمود فرع تحت خطوة IF: ترويسة ملوّنة + سلسلة الخطوات + زر إضافة
  function BranchColumn({
    listPath,
    title,
    tone,
  }: {
    listPath: number[];
    title: string;
    tone: "green" | "amber" | "red";
  }) {
    const list = getListAtPath(steps, listPath);
    const endKey = `end:${listPath.join(",")}`;
    const hKey = `${listPath.join(",")}:h`;
    const toneCls =
      tone === "green"
        ? "bg-green-100 text-green-700"
        : tone === "amber"
          ? "bg-amber-100 text-amber-700"
          : "bg-red-100 text-red-600";
    return (
      <div className="flex w-56 shrink-0 flex-col items-center">
        <div className="h-4 w-px bg-border" />
        <span
          ref={(el) => {
            if (el) cardRefs.current.set(hKey, el);
            else cardRefs.current.delete(hKey);
          }}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${toneCls}`}
        >
          {title}
        </span>
        <div className="h-3 w-px bg-border" />
        <StepChain listPath={listPath} />
        {list.length === 0 && (
          <>
            <div className="h-2 w-px bg-border" />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(endKey);
              }}
              onDragLeave={() => setDropTarget((t) => (t === endKey ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                const src = e.dataTransfer.getData("text/plain");
                setDropTarget(null);
                if (src) moveStepToEnd(src.split(",").map(Number), listPath);
              }}
              className={`w-full rounded-lg border border-dashed p-3 text-center text-[10px] text-muted-foreground transition-colors ${
                dropTarget === endKey ? "border-blue-500" : ""
              }`}
            >
              لا خطوات — أضف من الزر بالأسفل
            </div>
          </>
        )}
        <div className="h-2 w-px bg-border" />
        <button
          type="button"
          onClick={() => setEditor({ path: listPath, isNew: true })}
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget(endKey);
          }}
          onDragLeave={() => setDropTarget((t) => (t === endKey ? null : t))}
          onDrop={(e) => {
            e.preventDefault();
            const src = e.dataTransfer.getData("text/plain");
            setDropTarget(null);
            if (src) moveStepToEnd(src.split(",").map(Number), listPath);
          }}
          className={`flex items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary ${
            dropTarget === endKey ? "border-blue-500 text-primary" : "border-muted-foreground/40"
          }`}
        >
          <Plus className="h-3 w-3" />
          إضافة خطوة
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-xl border bg-card">
      {/* الشريط العلوي */}
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/workflows")}>
            سير العمل
          </Button>
          <span className="text-muted-foreground">←</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم سير العمل"
            className="h-8 w-64 font-medium"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setConditionsOpen(true)}>
            <Zap className="h-4 w-4" />
            الشروط
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? "حفظ التعديلات" : "حفظ ونشر"}
          </Button>
        </div>
      </div>

      {/* الـ Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0 overflow-auto">
          {/* خلفية منقّطة */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle, #d4d4d8 1.2px, transparent 1.2px)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="relative z-10 mx-auto flex w-fit min-w-[560px] flex-col items-center py-10">
            {/* عقدة المحفّز */}
            <button
              type="button"
              ref={(el) => {
                if (el) cardRefs.current.set("trigger", el);
                else cardRefs.current.delete("trigger");
              }}
              onClick={() => setConditionsOpen(true)}
              className="w-full rounded-xl border-2 border-green-500 bg-green-50/70 p-4 text-start shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">المُحفِّز</span>
                <Zap className="h-4 w-4 text-green-600" />
              </div>
              <p className="mt-1 font-medium">{triggerLabels[trigger]}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {triggerSummary()}
              </p>
              <p className="mt-2 text-xs text-green-600">انقر للتعديل</p>
            </button>

            {/* الخطوات — سلسلة رئيسية تتفرع مرئياً عند كل IF */}
            <div className="h-6 w-px" />
            <StepChain listPath={[]} />

            {/* إضافة خطوة */}
            <div className="h-6 w-px" />
            <button
              type="button"
              onClick={() => setEditor({ path: [], isNew: true })}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget("end:");
              }}
              onDragLeave={() => setDropTarget((t) => (t === "end:" ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                const src = e.dataTransfer.getData("text/plain");
                setDropTarget(null);
                if (src) moveStepToEnd(src.split(",").map(Number), []);
              }}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary ${
                dropTarget === "end:" ? "border-blue-500 text-primary" : "border-muted-foreground/40"
              }`}
            >
              <Plus className="h-4 w-4" />
              إضافة خطوة
            </button>
          </div>
        </div>

        {/* خطوط الوصل وأسهم GOTO — طبقة فوق البطاقات لا تلتقط الأحداث */}
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
          <defs>
            <marker
              id="goto-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="#6366f1" />
            </marker>
          </defs>
          {wires.map((w) =>
            w.kind === "goto" ? (
              <g key={w.key}>
                <path
                  d={w.d}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  markerEnd="url(#goto-arrow)"
                />
                {w.label && (
                  <text
                    x={w.midX}
                    y={w.midY}
                    fill="#6366f1"
                    fontSize={10}
                    textAnchor="middle"
                    stroke="#ffffff"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="select-none"
                  >
                    {w.label}
                  </text>
                )}
              </g>
            ) : (
              <path
                key={w.key}
                d={w.d}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1.5}
              />
            )
          )}
        </svg>
      </div>

      {/* لوحة الشروط الجانبية */}
      {conditionsOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30"
            onClick={() => setConditionsOpen(false)}
          />
          <div className="fixed inset-y-0 start-0 z-40 flex w-80 flex-col border-e bg-background shadow-xl">
            <div className="flex items-center justify-between border-b p-3">
              <h3 className="flex items-center gap-2 font-semibold">
                <Zap className="h-4 w-4 text-amber-500" />
                الشروط
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setConditionsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <p className="text-xs text-muted-foreground">
                بدون شروط — ينطبق على الكل. استخدم + أو بين الصفوف.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(triggerLabels).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTrigger(value)}
                    className={`rounded-md border px-3 py-2 text-xs transition-colors ${
                      trigger === value
                        ? "border-primary bg-accent font-medium"
                        : "hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {trigger === "KEYWORD" && (
                <div className="space-y-2">
                  <Label>الكلمات المفتاحية</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {keywords.map((k) => (
                      <Badge key={k} variant="secondary" className="gap-1">
                        {k}
                        <button
                          type="button"
                          onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                    placeholder="اكتب كلمة ثم Enter"
                  />
                </div>
              )}

              {trigger === "FROM_NUMBERS" && (
                <div className="space-y-2">
                  <Label>الأرقام (سطر لكل رقم)</Label>
                  <Textarea
                    value={phones.join("\n")}
                    onChange={(e) =>
                      setPhones(
                        e.target.value.split("\n").map((p) => p.trim()).filter(Boolean)
                      )
                    }
                    rows={4}
                    dir="ltr"
                    placeholder={"+905000000001"}
                    className="text-left"
                  />
                </div>
              )}

              {trigger === "STAGE_CHANGE" && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label>من حالة (اختياري)</Label>
                    <select
                      value={fromStage}
                      onChange={(e) => setFromStage(e.target.value)}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="">أي حالة</option>
                      {CONTACT_STAGES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>إلى حالة</Label>
                    <select
                      value={toStage}
                      onChange={(e) => setToStage(e.target.value)}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    >
                      {CONTACT_STAGES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {trigger === "NO_REPLY" && (
                <div className="space-y-2">
                  <Label>مدة الصمت قبل التشغيل (بالساعات)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    value={noReplyHours}
                    onChange={(e) =>
                      setNoReplyHours(
                        Math.min(720, Math.max(1, Number(e.target.value) || 24))
                      )
                    }
                    className="w-28"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    يُشغَّل سير العمل إذا لم يردّ العميل خلال هذه المدة
                  </p>
                </div>
              )}
            </div>
            <div className="border-t p-3">
              <Button className="w-full" onClick={() => setConditionsOpen(false)}>
                تم
              </Button>
            </div>
          </div>
        </>
      )}

      {/* نافذة إضافة/تعديل خطوة */}
      {editor !== null && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setEditor(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-[480px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-background p-4 shadow-2xl">
            {editor.isNew ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">إضافة خطوة</h3>
                  <Button variant="ghost" size="icon" onClick={() => setEditor(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 space-y-1">
                  {STEP_TYPES.map((s) => (
                    <button
                      key={s.type}
                      type="button"
                      onClick={() => {
                        setSteps((prev) => addStepAtPath(prev, editor.path, emptyStep(s.type)));
                        setEditor(null);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg p-3 text-start transition-colors hover:bg-muted"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${s.color}1a` }}
                      >
                        <s.icon className="h-4 w-4" style={{ color: s.color }} />
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{s.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {s.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : editingStep ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${stepMeta(editingStep.type).color}1a` }}
                    >
                      {(() => {
                        const MetaIcon = stepMeta(editingStep.type).icon;
                        return (
                          <MetaIcon
                            className="h-4 w-4"
                            style={{ color: stepMeta(editingStep.type).color }}
                          />
                        );
                      })()}
                    </span>
                    {stepMeta(editingStep.type).label}
                  </h3>
                  <Button variant="ghost" size="icon" onClick={() => setEditor(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {stepFields(editingStep, editor.path)}
                <div className="mt-4 flex items-center justify-between border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      setSteps((prev) => removeStepAtPath(prev, editor.path));
                      setEditor(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف الخطوة
                  </Button>
                  <Button size="sm" onClick={() => setEditor(null)}>
                    تم
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </>
      )}

      {/* سجل التشغيل أسفل الصفحة */}
      {isEdit && runs && runs.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-t bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            آخر التشغيلات
          </p>
          <div className="space-y-1">
            {runs.map((r) => (
              <details key={r.id} className="rounded-md border bg-background p-2 text-xs">
                <summary className="flex cursor-pointer items-center gap-2">
                  <Badge
                    variant={
                      r.status === "SUCCESS"
                        ? "secondary"
                        : r.status === "WAITING"
                          ? "warning"
                          : "default"
                    }
                  >
                    {r.status === "SUCCESS" ? "ناجح" : r.status === "WAITING" ? "بانتظار" : "فاشل"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("ar", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-muted-foreground" dir="rtl">
                  {r.logs || "لا يوجد سجل"}
                </pre>
              </details>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="border-t bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
