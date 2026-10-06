"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Bot,
  CalendarPlus,
  CheckCheck,
  Clock,
  CornerUpRight,
  Database,
  Flag,
  GitBranch,
  Image,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Send,
  StickyNote,
  Tag,
  Trash2,
  UserCheck,
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
  | { kind: "DB_CONTAINS"; text: string };

type OptionLists = {
  members: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  dbSources: { id: string; title: string }[];
};

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
  { type: "WAIT", label: "انتظار (تأخير)", description: "تأخير قبل متابعة الخطوات التالية", icon: Clock, color: "#f97316" },
  { type: "WEBHOOK", label: "Webhook", description: "إرسال بيانات العميل إلى رابط خارجي", icon: Webhook, color: "#0ea5e9" },
  { type: "GOTO", label: "الانتقال لخطوة", description: "القفز إلى خطوة أخرى في سير العمل (للأمام)", icon: CornerUpRight, color: "#6366f1" },
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

function emptyStep(type: string): Step {
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
      return { type, step: 1 };
    case "IF":
      return {
        type,
        condition: { kind: "STAGE", stage: "NEW" } satisfies IfCondition,
        then: [],
        else: [],
      };
    default:
      return { type };
  }
}

function conditionSummary(cond: IfCondition): string {
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
  }
}

// ملخص الخطوة المعروض داخل بطاقة العقدة
function stepSummary(step: Step, members: { id: string; name: string }[], templates: { id: string; name: string }[], agents: { id: string; name: string }[] = [], dbSources: { id: string; title: string }[] = []): string {
  switch (step.type) {
    case "SEND_MESSAGE": {
      const templateId = step.templateId as string | undefined;
      if (templateId) {
        return `قالب: ${templates.find((t) => t.id === templateId)?.name ?? "غير موجود"}`;
      }
      return ((step.body as string) || "بدون نص").slice(0, 60);
    }
    case "SEND_MEDIA":
      return (step.caption as string) || ((step.url as string) || "—").slice(0, 50);
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
    case "GOTO":
      return `إلى الخطوة ${step.step ?? 1}`;
    case "IF": {
      const cond = (step.condition as IfCondition | undefined) ?? { kind: "STAGE", stage: "NEW" };
      const thenSteps = Array.isArray(step.then) ? (step.then as Step[]).length : 0;
      const elseSteps = Array.isArray(step.else) ? (step.else as Step[]).length : 0;
      return `إذا ${conditionSummary(cond)} ← نعم:${thenSteps} لا:${elseSteps}`;
    }
    default:
      return "";
  }
}

// محرّر فروع الخطوة IF: صف مضغوط لكل خطوة بحقول إعداد inline
function BranchEditor({
  branch,
  onChange,
  members,
  templates,
  agents,
  dbSources,
}: {
  branch: Step[];
  onChange: (next: Step[]) => void;
  members: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  dbSources: { id: string; title: string }[];
}) {
  const selectCls = "w-full rounded-md border bg-background px-2 py-1.5 text-sm";

  function update(i: number, patch: Partial<Step>) {
    onChange(branch.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function fields(step: Step, patch: (p: Partial<Step>) => void) {
    switch (step.type) {
      case "SEND_MESSAGE":
        return (
          <Textarea
            value={(step.body as string) ?? ""}
            onChange={(e) => patch({ body: e.target.value })}
            placeholder="نص الرسالة…"
            rows={2}
          />
        );
      case "SEND_MEDIA":
        return (
          <>
            <Input
              value={(step.url as string) ?? ""}
              onChange={(e) => patch({ url: e.target.value })}
              placeholder="https://… (صورة/فيديو/PDF)"
              dir="ltr"
            />
            <Input
              value={(step.caption as string) ?? ""}
              onChange={(e) => patch({ caption: e.target.value })}
              placeholder="تسمية اختيارية"
            />
          </>
        );
      case "REQUEST_LOCATION":
        return (
          <Input
            value={(step.prompt as string) ?? ""}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder="نص طلب الموقع (اختياري)"
          />
        );
      case "ASSIGN":
        return (
          <select
            value={(step.userId as string) ?? "any"}
            onChange={(e) => patch({ userId: e.target.value })}
            className={selectCls}
          >
            <option value="any">أول عضو متاح في الفريق</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        );
      case "SET_AGENT":
        return (
          <select
            value={(step.agentId as string) ?? ""}
            onChange={(e) => patch({ agentId: e.target.value })}
            className={selectCls}
          >
            <option value="">اختر وكيلاً…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        );
      case "SET_STAGE":
        return (
          <select
            value={(step.stage as string) ?? "NEW"}
            onChange={(e) => patch({ stage: e.target.value })}
            className={selectCls}
          >
            {CONTACT_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        );
      case "ADD_TAG":
      case "REMOVE_TAG":
        return (
          <Input
            value={(step.tag as string) ?? ""}
            onChange={(e) => patch({ tag: e.target.value })}
            placeholder={step.type === "ADD_TAG" ? "وسم للإضافة" : "وسم للإزالة"}
          />
        );
      case "ADD_NOTE":
        return (
          <Textarea
            value={(step.body as string) ?? ""}
            onChange={(e) => patch({ body: e.target.value })}
            placeholder="نص الملاحظة الداخلية"
            rows={2}
          />
        );
      case "QUERY_DB":
        return (
          <select
            value={(step.sourceId as string) ?? ""}
            onChange={(e) => patch({ sourceId: e.target.value })}
            className={selectCls}
          >
            <option value="">اختر مصدر بيانات…</option>
            {dbSources.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        );
      case "WAIT":
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={(step.minutes as number) ?? 30}
              onChange={(e) => patch({ minutes: Number(e.target.value) || 1 })}
              className="w-24"
              dir="ltr"
            />
            <span className="text-xs text-muted-foreground">دقيقة</span>
          </div>
        );
      case "WEBHOOK":
        return (
          <Input
            value={(step.url as string) ?? ""}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="https://example.com/hook"
            dir="ltr"
          />
        );
      case "CREATE_BOOKING":
        return (
          <>
            <Input
              value={(step.title as string) ?? ""}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="عنوان الحجز"
            />
            <Input
              type="datetime-local"
              value={(step.scheduledAt as string) ?? ""}
              onChange={(e) => patch({ scheduledAt: e.target.value })}
              dir="ltr"
            />
            <Textarea
              value={(step.notes as string) ?? ""}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="ملاحظات (اختياري)"
              rows={2}
            />
          </>
        );
      default:
        return (
          <p className="text-xs text-muted-foreground">
            {stepSummary(step, members, templates, agents, dbSources) || "بدون إعدادات"}
          </p>
        );
    }
  }

  return (
    <div className="space-y-2">
      {branch.map((step, i) => {
        const meta = stepMeta(step.type);
        return (
          <div key={i} className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
            <div className="flex items-center gap-1.5">
              <meta.icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
              <select
                value={step.type}
                onChange={(e) =>
                  onChange(branch.map((s, j) => (j === i ? emptyStep(e.target.value) : s)))
                }
                className={selectCls}
              >
                {STEP_TYPES.filter((s) => s.type !== "IF" && s.type !== "GOTO").map((s) => (
                  <option key={s.type} value={s.type}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(branch.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                title="حذف"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {fields(step, (p) => update(i, p))}
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...branch, emptyStep("SEND_MESSAGE")])}
      >
        <Plus className="h-3.5 w-3.5" />
        إضافة للفرع
      </Button>
    </div>
  );
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
  const [steps, setSteps] = useState<Step[]>(
    Array.isArray(workflow?.steps) ? (workflow!.steps as Step[]) : []
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // نافذة الإضافة/التعديل: null مغلقة، -1 إضافة جديدة، وإلا فهرس الخطوة
  const [editor, setEditor] = useState<number | null>(null);
  // لوحة الشروط الجانبية
  const [conditionsOpen, setConditionsOpen] = useState(false);

  const editingStep = editor !== null && editor >= 0 ? steps[editor] : null;

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

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
  function stepFields(step: Step, index: number) {
    return (
      <div className="space-y-3 border-t pt-3">
        {step.type === "SEND_MESSAGE" && (
          <>
            {templates.length > 0 && (
              <select
                value={(step.templateId as string) ?? ""}
                onChange={(e) =>
                  updateStep(index, { templateId: e.target.value || undefined })
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
              onChange={(e) => updateStep(index, { body: e.target.value })}
              placeholder="نص الرسالة… {{name}} تُستبدل باسم العميل"
              rows={3}
            />
          </>
        )}
        {step.type === "ASSIGN" && (
          <select
            value={(step.userId as string) ?? "any"}
            onChange={(e) => updateStep(index, { userId: e.target.value })}
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
            onChange={(e) => updateStep(index, { stage: e.target.value })}
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
            onChange={(e) => updateStep(index, { tag: e.target.value })}
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
                updateStep(index, { minutes: Number(e.target.value) || 1 })
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
            onChange={(e) => updateStep(index, { url: e.target.value })}
            placeholder="https://example.com/hook"
            dir="ltr"
          />
        )}
        {step.type === "SEND_MEDIA" && (
          <>
            <Input
              value={(step.url as string) ?? ""}
              onChange={(e) => updateStep(index, { url: e.target.value })}
              placeholder="https://… (رابط مباشر لصورة/فيديو/PDF)"
              dir="ltr"
            />
            <Input
              value={(step.caption as string) ?? ""}
              onChange={(e) => updateStep(index, { caption: e.target.value })}
              placeholder="تسمية اختيارية للوسائط"
            />
          </>
        )}
        {step.type === "REQUEST_LOCATION" && (
          <Input
            value={(step.prompt as string) ?? ""}
            onChange={(e) => updateStep(index, { prompt: e.target.value })}
            placeholder="نص يطلب فيه موقع العميل (اختياري)"
          />
        )}
        {step.type === "SET_AGENT" && (
          <select
            value={(step.agentId as string) ?? ""}
            onChange={(e) => updateStep(index, { agentId: e.target.value })}
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
            onChange={(e) => updateStep(index, { tag: e.target.value })}
            placeholder="مثال: متابعة"
          />
        )}
        {step.type === "ADD_NOTE" && (
          <Textarea
            value={(step.body as string) ?? ""}
            onChange={(e) => updateStep(index, { body: e.target.value })}
            placeholder="ملاحظة داخلية عن العميل…"
            rows={3}
          />
        )}
        {step.type === "QUERY_DB" && (
          <select
            value={(step.sourceId as string) ?? ""}
            onChange={(e) => updateStep(index, { sourceId: e.target.value })}
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
              onChange={(e) => updateStep(index, { title: e.target.value })}
              placeholder="عنوان الحجز"
            />
            <Input
              type="datetime-local"
              value={(step.scheduledAt as string) ?? ""}
              onChange={(e) => updateStep(index, { scheduledAt: e.target.value })}
              dir="ltr"
            />
            <Textarea
              value={(step.notes as string) ?? ""}
              onChange={(e) => updateStep(index, { notes: e.target.value })}
              placeholder="ملاحظات (اختياري)"
              rows={2}
            />
          </>
        )}
        {step.type === "GOTO" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={(step.step as number) ?? 1}
              onChange={(e) =>
                updateStep(index, { step: Math.max(1, Number(e.target.value) || 1) })
              }
              className="w-28"
              dir="ltr"
            />
            <span className="text-sm text-muted-foreground">رقم الخطوة (1-based، للأمام)</span>
          </div>
        )}
        {step.type === "IF" &&
          (() => {
            const cond = (step.condition as IfCondition | undefined) ?? {
              kind: "STAGE",
              stage: "NEW",
            };
            const thenSteps = Array.isArray(step.then) ? (step.then as Step[]) : [];
            const elseSteps = Array.isArray(step.else) ? (step.else as Step[]) : [];
            const setCond = (patch: Partial<IfCondition>) =>
              updateStep(index, { condition: { ...cond, ...patch } });
            const options = {
              members,
              templates,
              agents,
              dbSources,
            };
            return (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>نوع الشرط</Label>
                  <select
                    value={cond.kind}
                    onChange={(e) => {
                      const kind = e.target.value as IfCondition["kind"];
                      const base: IfCondition =
                        kind === "STAGE"
                          ? { kind: "STAGE", stage: "NEW" }
                          : kind === "BUSINESS_HOURS"
                            ? { kind: "BUSINESS_HOURS" }
                            : kind === "HAS_TAG"
                              ? { kind: "HAS_TAG", tag: "" }
                              : kind === "TEXT_CONTAINS"
                                ? { kind: "TEXT_CONTAINS", text: "" }
                                : { kind: "DB_CONTAINS", text: "" };
                      updateStep(index, { condition: base });
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="STAGE">حالة العميل</option>
                    <option value="HAS_TAG">يحمل الوسم</option>
                    <option value="TEXT_CONTAINS">الرسالة تحتوي</option>
                    <option value="BUSINESS_HOURS">ضمن ساعات العمل</option>
                    <option value="DB_CONTAINS">نتيجة قاعدة البيانات تحتوي</option>
                  </select>
                  {cond.kind === "STAGE" && (
                    <select
                      value={cond.stage}
                      onChange={(e) => setCond({ stage: e.target.value })}
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
                      onChange={(e) => setCond({ tag: e.target.value })}
                      placeholder="الوسم المطلوب"
                    />
                  )}
                  {(cond.kind === "TEXT_CONTAINS" || cond.kind === "DB_CONTAINS") && (
                    <Input
                      value={cond.text}
                      onChange={(e) => setCond({ text: e.target.value })}
                      placeholder="النص المطلوب"
                    />
                  )}
                  {cond.kind === "BUSINESS_HOURS" && (
                    <p className="text-xs text-muted-foreground">
                      يُضبط من صفحة التكاملات: ساعات العمل
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>إذا تحقق الشرط (نعم)</Label>
                  <BranchEditor
                    branch={thenSteps}
                    onChange={(next) => updateStep(index, { then: next })}
                    {...options}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>وإلا (لا)</Label>
                  <BranchEditor
                    branch={elseSteps}
                    onChange={(next) => updateStep(index, { else: next })}
                    {...options}
                  />
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
      <div className="relative flex-1 overflow-y-auto">
        {/* خلفية منقّطة */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, #d4d4d8 1.2px, transparent 1.2px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative z-10 mx-auto flex w-80 flex-col items-center py-10">
          {/* عقدة المحفّز */}
          <button
            type="button"
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

          {/* الخطوات */}
          {steps.map((step, i) => {
            const meta = stepMeta(step.type);
            return (
              <div key={i} className="flex w-full flex-col items-center">
                <div className="h-6 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => setEditor(i)}
                  className="w-full rounded-xl border-2 border-blue-400 bg-background p-4 text-start shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      الخطوة {i + 1}
                    </span>
                    <meta.icon className="h-4 w-4" style={{ color: meta.color }} />
                  </div>
                  <p className="mt-1 font-medium">{meta.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {stepSummary(step, members, templates, agents, dbSources)}
                  </p>
                  <p className="mt-2 text-xs text-blue-500">انقر للتعديل</p>
                </button>
              </div>
            );
          })}

          {/* إضافة خطوة */}
          <div className="flex w-full flex-col items-center">
            <div className="h-6 w-px bg-border" />
            <button
              type="button"
              onClick={() => setEditor(-1)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Plus className="h-4 w-4" />
              إضافة خطوة
            </button>
          </div>
        </div>
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
            {editor === -1 ? (
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
                        setSteps([...steps, emptyStep(s.type)]);
                        setEditor(steps.length);
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
                {stepFields(editingStep, editor)}
                <div className="mt-4 flex items-center justify-between border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      setSteps(steps.filter((_, j) => j !== editor));
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
