"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckCheck,
  Clock,
  Flag,
  Loader2,
  Plus,
  Save,
  Send,
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
  { type: "ASSIGN", label: "تحديث وسم جلسة الاتصال", description: "إضافة أو إزالة وسوم على جهة الاتصال", icon: UserCheck, color: "#f59e0b" },
  { type: "SET_STAGE", label: "تحديث المرحلة", description: "نقل جهة الاتصال إلى مرحلة مختلفة", icon: Flag, color: "#a855f7" },
  { type: "ADD_TAG", label: "إضافة وسم", description: "إضافة وسم جديد لجهة الاتصال", icon: Tag, color: "#14b8a6" },
  { type: "AI_REPLY", label: "رد ذكي", description: "يرد الوكيل بمعرفته المربوطة (ملفات + نصوص + قواعد بيانات)", icon: Bot, color: "#8b5cf6" },
  { type: "CLOSE", label: "إغلاق المحادثة", description: "إغلاق المحادثة وإخفاءها من الوارد", icon: CheckCheck, color: "#64748b" },
  { type: "WAIT", label: "تأخرت", description: "تأخر بناءً على ما إذا كان الوقت الحالي ضمن وردية العمل", icon: Clock, color: "#f97316" },
  { type: "WEBHOOK", label: "Webhook", description: "إرسال بيانات العميل إلى رابط خارجي", icon: Webhook, color: "#0ea5e9" },
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
    case "ASSIGN":
      return { type, userId: "any" };
    case "SET_STAGE":
      return { type, stage: "NEW" };
    case "ADD_TAG":
      return { type, tag: "" };
    case "WAIT":
      return { type, minutes: 30 };
    case "WEBHOOK":
      return { type, url: "" };
    default:
      return { type };
  }
}

// ملخص الخطوة المعروض داخل بطاقة العقدة
function stepSummary(step: Step, members: { id: string; name: string }[], templates: { id: string; name: string }[]): string {
  switch (step.type) {
    case "SEND_MESSAGE": {
      const templateId = step.templateId as string | undefined;
      if (templateId) {
        return `قالب: ${templates.find((t) => t.id === templateId)?.name ?? "غير موجود"}`;
      }
      return ((step.body as string) || "بدون نص").slice(0, 60);
    }
    case "ASSIGN":
      return step.userId === "any"
        ? "أول عضو متاح في الفريق"
        : (members.find((m) => m.id === step.userId)?.name ?? "موظف محذوف");
    case "SET_STAGE":
      return `إلى: ${stageConfig((step.stage as string) ?? "NEW").label}`;
    case "ADD_TAG":
      return (step.tag as string) || "—";
    case "AI_REPLY":
      return "يرد الوكيل بمعرفته المربوطة";
    case "CLOSE":
      return "تُغلق المحادثة وتختفي من الوارد";
    case "WAIT":
      return `${step.minutes} دقيقة ثم تُستأنف الخطوات`;
    case "WEBHOOK":
      return ((step.url as string) || "—").slice(0, 50);
    default:
      return "";
  }
}

// محرّر سير العمل المرئي: canvas منقّط ببطاقات متصلة + نوافذ منبثقة
export function WorkflowBuilder({ workflow, runs, members, templates }: Props) {
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
        {(step.type === "AI_REPLY" || step.type === "CLOSE") && (
          <p className="text-xs text-muted-foreground">
            {step.type === "AI_REPLY"
              ? "يرد الوكيل بمعرفته المربوطة (ملفات + نصوص + قواعد بيانات)"
              : "تُغلق المحادثة وتختفي من الوارد"}
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
                    {stepSummary(step, members, templates)}
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
