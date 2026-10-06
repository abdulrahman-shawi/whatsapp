"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Loader2,
  Plus,
  Save,
  Trash2,
  Workflow as WorkflowIcon,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_STAGES } from "@/lib/contact-stages";
import { triggerLabels } from "./workflows-client";

// خطوة بصيغة JSON مرنة — الحقول حسب النوع
type Step = Record<string, unknown> & { type: string };

const STEP_TYPES: { type: string; label: string }[] = [
  { type: "SEND_MESSAGE", label: "إرسال رسالة أو قالب" },
  { type: "ASSIGN", label: "إسناد المحادثة لموظف" },
  { type: "SET_STAGE", label: "تغيير حالة العميل" },
  { type: "ADD_TAG", label: "إضافة وسم" },
  { type: "AI_REPLY", label: "رد بالذكاء الاصطناعي" },
  { type: "CLOSE", label: "إغلاق المحادثة" },
  { type: "WAIT", label: "انتظار (تأخير)" },
  { type: "WEBHOOK", label: "Webhook خارجي" },
];

function stepLabel(type: string): string {
  return STEP_TYPES.find((s) => s.type === type)?.label ?? type;
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

// منشئ سير العمل: المحفّز + الشروط + خطوات متسلسلة (بصري عمودي بسيط)
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

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addKeyword() {
    const k = keywordInput.trim();
    if (!k || keywords.includes(k)) return;
    setKeywords([...keywords, k]);
    setKeywordInput("");
  }

  function addPhone(value: string) {
    const p = value.trim();
    if (!p || phones.includes(p)) return;
    setPhones([...phones, p]);
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {isEdit ? `تعديل: ${workflow!.name}` : "سير عمل جديد"}
        </h1>
        <p className="text-sm text-muted-foreground">
          حدّد متى يبدأ وما الخطوات التي تُنفَّذ تلقائياً
        </p>
      </div>

      {/* الاسم */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">اسم سير العمل</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: ترحيب العملاء الجدد + متابعة بعد يوم"
          />
        </CardContent>
      </Card>

      {/* المحفّز والشروط */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-amber-500" />
            المُحفِّز
          </CardTitle>
          <CardDescription>متى يبدأ سير العمل؟</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(triggerLabels).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTrigger(value)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
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
              <Label>الكلمات المفتاحية (أي رسالة تحتوي واحدة منها)</Label>
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
                placeholder="اكتب كلمة ثم Enter — مثال: عروض"
              />
            </div>
          )}

          {trigger === "FROM_NUMBERS" && (
            <div className="space-y-2">
              <Label>الأرقام المحفِّرة (سطر لكل رقم)</Label>
              <Textarea
                value={phones.join("\n")}
                onChange={(e) =>
                  setPhones(
                    e.target.value
                      .split("\n")
                      .map((p) => p.trim())
                      .filter(Boolean)
                  )
                }
                rows={3}
                dir="ltr"
                placeholder={"+905000000001\n+905000000002"}
                className="text-left"
              />
            </div>
          )}

          {trigger === "STAGE_CHANGE" && (
            <div className="grid grid-cols-2 gap-2">
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
        </CardContent>
      </Card>

      {/* الخطوات */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <WorkflowIcon className="h-5 w-5 text-primary" />
            الخطوات
          </CardTitle>
          <CardDescription>
            تُنفَّذ بالترتيب من الأعلى للأسفل —{" "}
            <code dir="ltr">{"{{name}}"}</code> و{" "}
            <code dir="ltr">{"{{phone}}"}</code> يُستبدلان ببيانات العميل
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد خطوات — أضف أول خطوة من القائمة بالأسفل
            </p>
          )}

          {steps.map((step, i) => (
            <div key={i} className="space-y-2">
              {i > 0 && (
                <div className="flex justify-center text-muted-foreground">
                  <ArrowDown className="h-4 w-4" />
                </div>
              )}
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {i + 1}. {stepLabel(step.type)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-2 space-y-2">
                  {step.type === "SEND_MESSAGE" && (
                    <>
                      {templates.length > 0 && (
                        <select
                          value={(step.templateId as string) ?? ""}
                          onChange={(e) =>
                            updateStep(i, {
                              templateId: e.target.value || undefined,
                            })
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
                        onChange={(e) => updateStep(i, { body: e.target.value })}
                        placeholder="نص الرسالة… {{name}} تُستبدل باسم العميل"
                        rows={2}
                      />
                    </>
                  )}
                  {step.type === "ASSIGN" && (
                    <select
                      value={(step.userId as string) ?? "any"}
                      onChange={(e) => updateStep(i, { userId: e.target.value })}
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
                      onChange={(e) => updateStep(i, { stage: e.target.value })}
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
                      onChange={(e) => updateStep(i, { tag: e.target.value })}
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
                          updateStep(i, { minutes: Number(e.target.value) || 1 })
                        }
                        className="w-28"
                        dir="ltr"
                      />
                      <span className="text-sm text-muted-foreground">دقيقة</span>
                      <span className="text-xs text-muted-foreground">
                        (تُستأنف الخطوات التالية تلقائياً بعد انقضاء المدة)
                      </span>
                    </div>
                  )}
                  {step.type === "WEBHOOK" && (
                    <Input
                      value={(step.url as string) ?? ""}
                      onChange={(e) => updateStep(i, { url: e.target.value })}
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
              </div>
            </div>
          ))}

          {/* إضافة خطوة */}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {STEP_TYPES.map((s) => (
              <Button
                key={s.type}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSteps([...steps, emptyStep(s.type)])}
              >
                <Plus className="h-3.5 w-3.5" />
                {s.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* سجل التشغيل */}
      {isEdit && runs && runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">آخر التشغيلات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {runs.map((r) => (
              <details key={r.id} className="rounded-md border p-2 text-sm">
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
                    {r.status === "SUCCESS"
                      ? "ناجح"
                      : r.status === "WAITING"
                        ? "بانتظار"
                        : "فاشل"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("ar", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground" dir="rtl">
                  {r.logs || "لا يوجد سجل"}
                </pre>
              </details>
            ))}
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isEdit ? "حفظ التعديلات" : "إنشاء سير العمل"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/workflows")}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
