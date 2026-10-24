"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Database,
  FileText,
  FileUp,
  Globe,
  Lightbulb,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  X,
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
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/time";
import { AGENT_SKILLS } from "@/lib/agent-skills";
import { TestChat } from "./test-chat";

// بيانات الوكيل كما تصل من الصفحة (خادم) إلى الاستوديو
export type StudioKnowledgeItem = {
  id: string;
  title: string;
  type: "TEXT" | "FILE" | "DB" | "WEBSITE";
  content: string;
  url?: string | null;
  lastSyncedAt?: string | null;
};

export type StudioAgent = {
  id: string;
  name: string;
  systemPrompt: string;
  welcomeMessage: string;
  offHoursReply: string | null;
  responseDelaySec: number;
  voiceReplies: boolean;
  handoffKeywords: string[];
  isActive: boolean;
  updatedAt: string;
  instructions: { id: string; title: string; content: string }[];
  skills: string[];
  knowledgeSources: StudioKnowledgeItem[];
};

type InstructionBlock = { id: string; title: string; content: string };
type PendingSource = { title: string; content: string };

const QUICK_KEYWORDS = ["موظف", "شكوى", "مدير"];

// قوالب مطالبات جاهزة تُدرج داخل قسم التعليمات عند الحاجة
const PROMPT_TEMPLATES: { name: string; text: string }[] = [
  {
    name: "التعامل مع الشكاوى",
    text: "عند شكوى العميل: اعتذر بصدق، واطلب تفاصيل الطلب (الرقم أو المنتج)، واطمئنه أنك تتابع له، وإن استمرت الشكوى أو غضب العميل صعّد المحادثة لموظف.",
  },
  {
    name: "جمع بيانات العميل",
    text: "اطلب من العميل اسمه وبريده الإلكتروني ورقم هاتفه عند الحاجة، مع ذكر السبب (متابعة الطلب أو التواصل بخصوص العرض).",
  },
  {
    name: "الرد على استفسارات الأسعار",
    text: "اقتبس الأسعار فقط من معلومات المعرفة المرفقة دون اختراع أرقام، وإن لم يوجد سعر للمنتج المطلوب أخبر العميل أن الفريق سيؤكد له السعر.",
  },
  {
    name: "إغلاق المحادثة والتصعيد",
    text: "أنهِ المحادثة بتلخيص ما تم الاتفاق عليه وخطوة الخطوة القادمة، وإذا طلب العميل موظفاً بشرياً أو احتاج الأمر صلاحية بشرية سلّم المحادثة للفريق فوراً.",
  },
  {
    name: "النبرة والأسلوب",
    text: "تحدث بلغة العميل وبأسلوب ودود مهني مختصر، تجنّب المصطلحات التقنية المعقدة، ولا تستخدم رموزاً تعبيرية كثيرة.",
  },
  {
    name: "خارج أوقات الدوام",
    text: "إذا سأل العميل عن مواعيد العمل أو طلب خدمة خارج الدوام، أخبره بموعد العودة القادم ووعده بالمتابعة.",
  },
];

const WRITING_GUIDE = [
  "اكتب التعليمات كأوامر مباشرة: «افعل كذا» بدل «ربما يمكنك».",
  "حدد ماذا يفعل الوكيل عند غياب المعلومة بدل اختراعها.",
  "قسّم السيناريوهات المختلفة إلى أقسام منفصلة لتسهل مراجعتها.",
  "جرّب الوكيل من لوحة الاختبار بعد كل تعديل مهم.",
];

function newBlockId(): string {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// مفتاح تبديل صغير بنمط respond.io
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function AgentStudio({ agent }: { agent?: StudioAgent }) {
  const router = useRouter();
  const isEdit = Boolean(agent);

  const initial = useRef({
    name: agent?.name ?? "",
    systemPrompt: agent?.systemPrompt ?? "",
    welcomeMessage: agent?.welcomeMessage ?? "",
    offHoursReply: agent?.offHoursReply ?? "",
    responseDelaySec: agent?.responseDelaySec ?? 3,
    voiceReplies: agent?.voiceReplies ?? false,
    handoffKeywords: agent?.handoffKeywords ?? [],
    isActive: agent?.isActive ?? true,
    instructions: agent?.instructions ?? [],
    skills: agent?.skills ?? [],
  });

  const [name, setName] = useState(initial.current.name);
  const [systemPrompt, setSystemPrompt] = useState(initial.current.systemPrompt);
  const [instructions, setInstructions] = useState<InstructionBlock[]>(
    initial.current.instructions
  );
  const [skills, setSkills] = useState<string[]>(initial.current.skills);
  const [welcomeMessage, setWelcomeMessage] = useState(initial.current.welcomeMessage);
  const [offHoursReply, setOffHoursReply] = useState(initial.current.offHoursReply);
  const [responseDelaySec, setResponseDelaySec] = useState(
    initial.current.responseDelaySec
  );
  const [voiceReplies, setVoiceReplies] = useState(initial.current.voiceReplies);
  const [handoffKeywords, setHandoffKeywords] = useState<string[]>(
    initial.current.handoffKeywords
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [isActive, setIsActive] = useState(initial.current.isActive);
  const [updatedAt, setUpdatedAt] = useState(agent?.updatedAt ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const [sources, setSources] = useState<StudioKnowledgeItem[]>(
    agent?.knowledgeSources ?? []
  );
  const [pendingSources, setPendingSources] = useState<PendingSource[]>([]);

  const [activeTab, setActiveTab] = useState<"test" | "knowledge">("test");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // حقول قوالب المطالبات والإرشاد — القائمة المنبثقة تُدرج في القسم المفتوح
  const [templateFor, setTemplateFor] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  const snapshot = useMemo(
    () => ({
      name,
      systemPrompt,
      welcomeMessage,
      offHoursReply,
      responseDelaySec,
      voiceReplies,
      handoffKeywords,
      isActive,
      instructions,
      skills,
    }),
    [
      name,
      systemPrompt,
      welcomeMessage,
      offHoursReply,
      responseDelaySec,
      voiceReplies,
      handoffKeywords,
      isActive,
      instructions,
      skills,
    ]
  );
  const dirty = JSON.stringify(snapshot) !== JSON.stringify(initial.current);

  function resetForm() {
    const i = initial.current;
    setName(i.name);
    setSystemPrompt(i.systemPrompt);
    setInstructions(i.instructions);
    setSkills(i.skills);
    setWelcomeMessage(i.welcomeMessage);
    setOffHoursReply(i.offHoursReply);
    setResponseDelaySec(i.responseDelaySec);
    setVoiceReplies(i.voiceReplies);
    setHandoffKeywords(i.handoffKeywords);
    setIsActive(i.isActive);
    setError("");
  }

  function addKeyword(keyword: string) {
    const k = keyword.trim();
    if (!k || handoffKeywords.includes(k)) return;
    setHandoffKeywords([...handoffKeywords, k]);
    setKeywordInput("");
  }

  function toggleSkill(key: string) {
    setSkills((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function updateBlock(id: string, patch: Partial<InstructionBlock>) {
    setInstructions((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  }

  // إدراج قالب عند موضع المؤشر داخل قسم معيّن (أو في نهاته)
  function insertTemplate(blockId: string, text: string) {
    const ta = textareaRefs.current.get(blockId);
    const block = instructions.find((b) => b.id === blockId);
    if (!block) return;
    const at = ta ? ta.selectionStart ?? block.content.length : block.content.length;
    const content = `${block.content.slice(0, at)}${text}${block.content.slice(at)}`;
    updateBlock(blockId, { content });
    setTemplateFor(null);
    requestAnimationFrame(() => {
      const el = textareaRefs.current.get(blockId);
      if (el) {
        el.focus();
        const pos = at + text.length;
        el.setSelectionRange(pos, pos);
      }
    });
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    const payload = {
      ...snapshot,
      ...(isEdit ? {} : { knowledgeSources: pendingSources }),
    };
    const res = await fetch(isEdit ? `/api/agents/${agent!.id}` : "/api/agents", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء الحفظ");
      return;
    }
    const data = await res.json();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
    if (isEdit) {
      initial.current = snapshot;
      setUpdatedAt(data.agent?.updatedAt ?? updatedAt);
      router.refresh();
    } else {
      router.push(`/agents/${data.agent.id}/edit`);
    }
  }

  const allKnowledge = [
    ...sources.map((s) => s.content),
    ...pendingSources.map((s) => s.content),
  ];

  return (
    <div className="space-y-4">
      {/* الشريط العلوي: الاسم + آخر تحديث + تفعيل + حفظ/إلغاء */}
      <div className="sticky top-0 z-20 -mx-1 space-y-3 border-b bg-background/95 px-1 pb-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/agents")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4" />
            الوكلاء
          </button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم الوكيل"
            className="h-8 max-w-xs border-transparent bg-transparent text-lg font-bold hover:border-input focus:border-input"
            required
          />
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              آخر تحديث {relativeTime(updatedAt)}
            </span>
          )}
          <div className="ms-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Toggle checked={isActive} onChange={setIsActive} label="تفعيل الرد الآلي" />
              تفعيل الرد الآلي
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetForm}
              disabled={!dirty || saving}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!dirty || saving || !name.trim() || !systemPrompt.trim()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedFlash ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savedFlash ? "تم الحفظ" : "حفظ"}
            </Button>
          </div>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* العمود الرئيسي */}
        <div className="min-w-0 space-y-4">
          {/* التعليمات الأساسية */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">تعليمات الوكيل</CardTitle>
              <CardDescription>
                الشخصية الأساسية والدور — ما هو الوكيل، وما نبرته، وما حدوده
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="أنت مساعد تدريب رياضي في نادٍ، أجب بأسلوب مهني واقتبس من قائمة الأسعار"
                rows={4}
                required
              />
            </CardContent>
          </Card>

          {/* أقسام التعليمات الإضافية */}
          <div className="space-y-3">
            {instructions.map((block) => (
              <Card key={block.id}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={block.title}
                      onChange={(e) =>
                        updateBlock(block.id, { title: e.target.value })
                      }
                      placeholder="عنوان القسم (مثال: محادثة متقنة)"
                      className="h-8 font-medium"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setInstructions((prev) =>
                          prev.filter((b) => b.id !== block.id)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    ref={(el) => {
                      if (el) textareaRefs.current.set(block.id, el);
                      else textareaRefs.current.delete(block.id);
                    }}
                    value={block.content}
                    onChange={(e) =>
                      updateBlock(block.id, { content: e.target.value })
                    }
                    placeholder="التعليمات التفصيلية لهذا القسم…"
                    rows={5}
                  />
                  <div className="flex items-center gap-2 text-xs">
                    {/* إضافة قوالب مطالبات */}
                    <div className="relative">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setTemplateFor(
                            templateFor === block.id ? null : block.id
                          )
                        }
                      >
                        <Library className="h-3.5 w-3.5" />
                        إضافة قوالب مطالبات
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      {templateFor === block.id && (
                        <div className="absolute start-0 top-full z-30 mt-1 w-72 rounded-md border bg-popover p-1 shadow-md">
                          {PROMPT_TEMPLATES.map((t) => (
                            <button
                              key={t.name}
                              type="button"
                              onClick={() => insertTemplate(block.id, t.text)}
                              className="block w-full rounded-sm px-2 py-1.5 text-start text-xs hover:bg-accent"
                            >
                              {t.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* تعلم كيفية كتابة هذا */}
                    <div className="relative">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => setGuideOpen((v) => !v)}
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        تعلم كيفية كتابة هذا
                      </button>
                      {guideOpen && (
                        <div className="absolute start-0 top-full z-30 mt-1 w-72 rounded-md border bg-popover p-3 shadow-md">
                          <ul className="space-y-1.5 text-xs text-muted-foreground">
                            {WRITING_GUIDE.map((tip) => (
                              <li key={tip} className="flex gap-1.5">
                                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-primary" />
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setInstructions((prev) => [
                  ...prev,
                  { id: newBlockId(), title: "", content: "" },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              إضافة قسم
            </Button>
          </div>

          {/* المهارات */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">هل تحتاج إلى المزيد من الخيارات؟</CardTitle>
              <CardDescription>
                مهارات تنفَّذ فعلياً أثناء المحادثة — يستدعيها الوكيل عند الحاجة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {AGENT_SKILLS.map((skill) => {
                  const on = skills.includes(skill.key);
                  return (
                    <button
                      key={skill.key}
                      type="button"
                      onClick={() => toggleSkill(skill.key)}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {skill.name}
                      <Toggle
                        checked={on}
                        onChange={() => toggleSkill(skill.key)}
                        label={skill.name}
                      />
                    </button>
                  );
                })}
              </div>
              {skills.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  المهارات المفعّلة تستهلك توكنات إضافية عند استدعائها أثناء الرد.
                </p>
              )}
            </CardContent>
          </Card>

          {/* إعدادات متقدمة */}
          <Card>
            <button
              type="button"
              className="flex w-full items-center justify-between p-4 text-start"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">إعدادات متقدمة</span>
                <span className="text-xs text-muted-foreground">
                  الترحيب، خارج الدوام، التسليم، التوقيت
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  showAdvanced && "rotate-180"
                )}
              />
            </button>
            {showAdvanced && (
              <CardContent className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <Label>رسالة الترحيب</Label>
                  <Textarea
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="أهلاً بك! كيف أقدر أساعدك اليوم؟"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>الرد خارج أوقات الدوام (اختياري)</Label>
                  <Textarea
                    value={offHoursReply}
                    onChange={(e) => setOffHoursReply(e.target.value)}
                    placeholder="أهلاً بك، نعود للعمل {{nextOpening}} وسنرد عليك حينها"
                    rows={2}
                    dir="rtl"
                  />
                  <p className="text-xs text-muted-foreground">
                    يُرسل خارج ساعات العمل بدل الرد الذكي. يمكنك استخدام{" "}
                    <code dir="ltr">{"{{nextOpening}}"}</code> لموعد العودة.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>كلمات التسليم لموظف بشري</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {handoffKeywords.map((k) => (
                      <Badge key={k} variant="secondary" className="gap-1">
                        {k}
                        <button
                          type="button"
                          onClick={() =>
                            setHandoffKeywords(handoffKeywords.filter((x) => x !== k))
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addKeyword(keywordInput);
                        }
                      }}
                      placeholder="اكتب كلمة ثم اضغط Enter"
                      className="h-8 text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addKeyword(keywordInput)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    اقتراحات:
                    {QUICK_KEYWORDS.filter((k) => !handoffKeywords.includes(k)).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => addKeyword(k)}
                        className="rounded-md border px-2 py-0.5 hover:bg-muted"
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="space-y-2">
                    <Label>وقت الانتظار قبل الرد (ثوانٍ)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={responseDelaySec}
                      onChange={(e) => setResponseDelaySec(Number(e.target.value) || 0)}
                      className="w-28"
                      dir="ltr"
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={voiceReplies}
                      onChange={(e) => setVoiceReplies(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      ردود صوتية
                      <span className="mt-1 block text-xs text-muted-foreground">
                        يستخدم OpenAI TTS لصنع رسالة صوتية في واتساب
                      </span>
                    </span>
                  </label>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* العمود الأيمن: اختبار + معرفة */}
        <div className="min-w-0">
          <div className="sticky top-[4.5rem] flex max-h-[calc(100vh-6rem)] flex-col gap-3">
            <div className="flex gap-1 border-b">
              {(
                [
                  { key: "test", label: "اختبار" },
                  { key: "knowledge", label: "قاعدة المعرفة" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    activeTab === tab.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "test" ? (
              <TestChat
                agentId={isEdit ? agent!.id : undefined}
                systemPrompt={systemPrompt}
                instructions={instructions}
                skills={skills}
                knowledge={allKnowledge}
              />
            ) : (
              <KnowledgePanel
                isEdit={isEdit}
                agentId={agent?.id}
                sources={sources}
                pendingSources={pendingSources}
                onSourcesChange={setSources}
                onPendingChange={setPendingSources}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// لوحة قاعدة المعرفة: المصادر الحالية + إضافة (نص / ملف / قاعدة بيانات / رابط موقع)
function KnowledgePanel({
  isEdit,
  agentId,
  sources,
  pendingSources,
  onSourcesChange,
  onPendingChange,
}: {
  isEdit: boolean;
  agentId?: string;
  sources: StudioKnowledgeItem[];
  pendingSources: PendingSource[];
  onSourcesChange: (s: StudioKnowledgeItem[]) => void;
  onPendingChange: (s: PendingSource[]) => void;
}) {
  // نص
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  // ملف
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // قاعدة بيانات
  const [dbTitle, setDbTitle] = useState("");
  const [dbEngine, setDbEngine] = useState<"mysql" | "postgres">("mysql");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("3306");
  const [dbName, setDbName] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbQuery, setDbQuery] = useState("");
  const [dbTesting, setDbTesting] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  // موقع
  const [siteUrl, setSiteUrl] = useState("");
  const [siteBusy, setSiteBusy] = useState(false);
  const [sitePreview, setSitePreview] = useState<{
    pages: number;
    chars: number;
    preview: string;
  } | null>(null);
  const [siteError, setSiteError] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState("");

  async function addTextSource() {
    if (!sourceTitle.trim() || !sourceContent.trim()) return;
    if (isEdit) {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sourceTitle, content: sourceContent }),
      });
      if (res.ok) {
        const data = await res.json();
        onSourcesChange([...sources, data.source]);
      } else {
        const data = await res.json().catch(() => null);
        setPanelError(data?.error ?? "فشل إضافة المصدر");
      }
    } else {
      onPendingChange([
        ...pendingSources,
        { title: sourceTitle.trim(), content: sourceContent.trim() },
      ]);
    }
    setSourceTitle("");
    setSourceContent("");
  }

  async function uploadFile(file: File) {
    if (!isEdit) return;
    setUploading(true);
    setPanelError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        onSourcesChange([...sources, data.source]);
      } else {
        setPanelError(data.error ?? "فشل رفع الملف");
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteSource(id: string) {
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (res.ok) onSourcesChange(sources.filter((s) => s.id !== id));
  }

  function dbPayload(test: boolean) {
    return {
      type: "DB",
      test,
      title: dbTitle,
      dbEngine,
      dbHost,
      dbPort: dbPort ? Number(dbPort) : undefined,
      dbName,
      dbUser,
      dbPassword,
      dbQuery,
    };
  }

  async function testDbSource() {
    if (!isEdit) return;
    setDbTesting(true);
    setDbTestResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dbPayload(true)),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setDbTestResult({
          ok: true,
          text: data.rowCount > 0 ? data.text : "الاتصال ناجح — الاستعلام أعاد 0 صفوف",
        });
      } else {
        setDbTestResult({ ok: false, text: data?.error ?? "فشل الاختبار" });
      }
    } finally {
      setDbTesting(false);
    }
  }

  async function addDbSource() {
    if (!isEdit) return;
    const res = await fetch(`/api/agents/${agentId}/knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dbPayload(false)),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      onSourcesChange([...sources, data.source]);
      setDbTitle("");
      setDbQuery("");
      setDbTestResult(null);
    } else {
      setPanelError(data?.error ?? "فشل حفظ مصدر قاعدة البيانات");
    }
  }

  // معاينة زحف موقع دون حفظ
  async function previewSite() {
    if (!isEdit) return;
    setSiteBusy(true);
    setSitePreview(null);
    setSiteError("");
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "WEBSITE", url: siteUrl, test: true }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setSitePreview({ pages: data.pages, chars: data.chars, preview: data.preview });
      } else {
        setSiteError(data?.error ?? "تعذّر سحب الموقع");
      }
    } finally {
      setSiteBusy(false);
    }
  }

  async function saveSite() {
    if (!isEdit) return;
    setSiteBusy(true);
    setSiteError("");
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "WEBSITE", url: siteUrl }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        onSourcesChange([...sources, data.source]);
        setSiteUrl("");
        setSitePreview(null);
      } else {
        setSiteError(data?.error ?? "فشل حفظ مصدر الموقع");
      }
    } finally {
      setSiteBusy(false);
    }
  }

  // إعادة مزامنة مصدر موقع محفوظ
  async function resyncSource(source: StudioKnowledgeItem) {
    setSyncingId(source.id);
    setPanelError("");
    try {
      const res = await fetch(`/api/knowledge/${source.id}`, { method: "PATCH" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        onSourcesChange(
          sources.map((s) =>
            s.id === source.id ? { ...s, content: data.source.content, lastSyncedAt: data.source.lastSyncedAt } : s
          )
        );
      } else {
        setPanelError(data?.error ?? "فشت إعادة المزامنة");
      }
    } finally {
      setSyncingId(null);
    }
  }

  const typeBadge = (t: StudioKnowledgeItem["type"]) =>
    t === "FILE" ? "ملف" : t === "DB" ? "قاعدة بيانات" : t === "WEBSITE" ? "موقع" : "نص";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {/* قائمة المصادر */}
      {sources.length + pendingSources.length > 0 && (
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.title}</span>
                    <Badge
                      variant={
                        s.type === "WEBSITE"
                          ? "default"
                          : s.type === "FILE"
                            ? "secondary"
                            : s.type === "DB"
                              ? "warning"
                              : "outline"
                      }
                    >
                      {typeBadge(s.type)}
                    </Badge>
                  </div>
                  {s.type === "WEBSITE" && s.url && (
                    <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">
                      {s.url}
                    </p>
                  )}
                  {s.type === "WEBSITE" && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {s.lastSyncedAt
                          ? `آخر مزامنة ${relativeTime(s.lastSyncedAt)}`
                          : "لم تتم المزامنة بعد"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={syncingId === s.id}
                        onClick={() => resyncSource(s)}
                      >
                        {syncingId === s.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        مزامنة
                      </Button>
                    </div>
                  )}
                  {s.type !== "WEBSITE" && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {s.content}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteSource(s.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {pendingSources.map((s, i) => (
            <div
              key={`pending-${i}`}
              className="flex items-start justify-between gap-2 rounded-md border border-dashed p-3"
            >
              <div className="min-w-0">
                <span className="truncate text-sm font-medium">{s.title}</span>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.content}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onPendingChange(pendingSources.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {panelError && (
        <p className="text-xs text-destructive" role="alert">
          {panelError}
        </p>
      )}

      {/* إضافة نص */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" />
          إضافة نص
        </div>
        <Input
          value={sourceTitle}
          onChange={(e) => setSourceTitle(e.target.value)}
          placeholder="عنوان المصدر (مثال: قائمة الأسعار)"
          className="h-8 text-sm"
        />
        <Textarea
          value={sourceContent}
          onChange={(e) => setSourceContent(e.target.value)}
          placeholder="المحتوى الذي سيعتمد عليه الوكيل…"
          rows={3}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTextSource}
          disabled={!sourceTitle.trim() || !sourceContent.trim()}
        >
          <Plus className="h-4 w-4" />
          إضافة المصدر
        </Button>
      </div>

      {/* رفع ملف */}
      <div className="rounded-md border p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileUp className="h-4 w-4" />
          رفع ملف (PDF أو Word)
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
          }}
        />
        {isEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            {uploading ? "جارٍ استخراج النص…" : "اختيار ملف"}
          </Button>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            احفظ الوكيل أولاً لتتمكن من رفع الملفات
          </p>
        )}
      </div>

      {/* رابط موقع */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Globe className="h-4 w-4" />
          رابط موقع
        </div>
        <p className="text-xs text-muted-foreground">
          يزحف الوكيل الصفحة وروابط الموقع الداخلية (حتى 10 صفحات) ويتعلم من محتواها.
          يعمل مع الصفحات الثابتة دون تنفيذ JavaScript.
        </p>
        <Input
          value={siteUrl}
          onChange={(e) => {
            setSiteUrl(e.target.value);
            setSitePreview(null);
            setSiteError("");
          }}
          placeholder="https://example.com"
          dir="ltr"
          className="h-8 text-sm"
        />
        {siteError && <p className="text-xs text-destructive">{siteError}</p>}
        {sitePreview && (
          <div className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-700">
            <p>
              جاهز للحفظ: {sitePreview.pages} صفحة، {sitePreview.chars} حرفاً
            </p>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{sitePreview.preview}</p>
          </div>
        )}
        {isEdit ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={previewSite}
              disabled={siteBusy || !siteUrl.trim()}
            >
              {siteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              معاينة
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveSite}
              disabled={siteBusy || !siteUrl.trim()}
            >
              <Plus className="h-4 w-4" />
              حفظ المصدر
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            احفظ الوكيل أولاً ثم عد لإضافة مصادر المواقع
          </p>
        )}
      </div>

      {/* قاعدة بيانات خارجية */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database className="h-4 w-4" />
          ربط قاعدة بيانات (MySQL / Postgres)
        </div>
        <p className="text-xs text-muted-foreground">
          يقرأ الوكيل من جداول عملاءك عند كل رسالة. استخدم{" "}
          <code dir="ltr">{"{{phone}}"}</code> ليُستبدل برقم العميل (استعلامات SELECT
          فقط).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={dbTitle}
            onChange={(e) => setDbTitle(e.target.value)}
            placeholder="عنوان المصدر"
            className="h-8 text-sm"
          />
          <select
            value={dbEngine}
            onChange={(e) => setDbEngine(e.target.value as "mysql" | "postgres")}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="mysql">MySQL</option>
            <option value="postgres">PostgreSQL</option>
          </select>
          <Input
            value={dbHost}
            onChange={(e) => setDbHost(e.target.value)}
            placeholder="db.example.com"
            dir="ltr"
            className="h-8 text-sm"
          />
          <Input
            value={dbPort}
            onChange={(e) => setDbPort(e.target.value)}
            placeholder="3306 / 5432"
            dir="ltr"
            className="h-8 text-sm"
          />
          <Input
            value={dbName}
            onChange={(e) => setDbName(e.target.value)}
            placeholder="اسم القاعدة"
            dir="ltr"
            className="h-8 text-sm"
          />
          <Input
            value={dbUser}
            onChange={(e) => setDbUser(e.target.value)}
            placeholder="اسم المستخدم"
            dir="ltr"
            className="h-8 text-sm"
          />
          <Input
            type="password"
            value={dbPassword}
            onChange={(e) => setDbPassword(e.target.value)}
            placeholder="كلمة المرور"
            dir="ltr"
            className="h-8 text-sm"
          />
        </div>
        <Textarea
          value={dbQuery}
          onChange={(e) => setDbQuery(e.target.value)}
          placeholder={"SELECT name, balance FROM customers WHERE phone = {{phone}}"}
          rows={2}
          dir="ltr"
          className="text-left font-mono text-xs"
        />
        {dbTestResult && (
          <pre
            className={cn(
              "max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border p-2 text-xs",
              dbTestResult.ok
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            )}
            dir="ltr"
          >
            {dbTestResult.text}
          </pre>
        )}
        {isEdit ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testDbSource}
              disabled={dbTesting || !dbTitle.trim() || !dbHost.trim() || !dbQuery.trim()}
            >
              {dbTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              اختبار الاتصال
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={addDbSource}
              disabled={!dbTitle.trim() || !dbHost.trim() || !dbQuery.trim()}
            >
              <Plus className="h-4 w-4" />
              حفظ المصدر
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            احفظ الوكيل أولاً ثم عد لإضافة مصادر قواعدة البيانات
          </p>
        )}
      </div>
    </div>
  );
}
