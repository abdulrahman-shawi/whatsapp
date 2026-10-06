"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileUp, Loader2, Plus, Trash2, X, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TestChat } from "./test-chat";

// مصدر معرفة محفوظ في قاعدة البيانات
export type KnowledgeItem = {
  id: string;
  title: string;
  type: "TEXT" | "FILE" | "DB";
  content: string;
  dbEngine?: string | null;
  dbHost?: string | null;
  dbQuery?: string | null;
};

export type AgentFormData = {
  id: string;
  name: string;
  systemPrompt: string;
  welcomeMessage: string;
  responseDelaySec: number;
  handoffKeywords: string[];
  isActive: boolean;
  knowledgeSources: KnowledgeItem[];
};

// مصدر نصي محلي (قبل إنشاء الوكيل)
type PendingSource = { title: string; content: string };

const QUICK_KEYWORDS = ["موظف", "شكوى", "مدير"];

// نموذج مشترك لإنشاء وتعديل الوكيل — بدون agent = وضع الإنشاء
export function AgentForm({ agent }: { agent?: AgentFormData }) {
  const router = useRouter();
  const isEdit = Boolean(agent);

  const [name, setName] = useState(agent?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState(
    agent?.welcomeMessage ?? ""
  );
  const [responseDelaySec, setResponseDelaySec] = useState(
    agent?.responseDelaySec ?? 3
  );
  const [handoffKeywords, setHandoffKeywords] = useState<string[]>(
    agent?.handoffKeywords ?? []
  );
  const [isActive, setIsActive] = useState(agent?.isActive ?? true);

  // المصادر المحفوظة (وضع التعديل) والمعلّقة (وضع الإنشاء)
  const [sources, setSources] = useState<KnowledgeItem[]>(
    agent?.knowledgeSources ?? []
  );
  const [pendingSources, setPendingSources] = useState<PendingSource[]>([]);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  // حقول مصدر قاعدة البيانات الخارجية
  const [dbTitle, setDbTitle] = useState("");
  const [dbEngine, setDbEngine] = useState<"mysql" | "postgres">("mysql");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("3306");
  const [dbName, setDbName] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbQuery, setDbQuery] = useState("");
  const [dbTesting, setDbTesting] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // كل محتويات المعرفة الحالية — يستخدمها صندوق التجربة
  const allKnowledge = [
    ...sources.map((s) => s.content),
    ...pendingSources.map((s) => s.content),
  ];

  function addKeyword(keyword: string) {
    const k = keyword.trim();
    if (!k || handoffKeywords.includes(k)) return;
    setHandoffKeywords([...handoffKeywords, k]);
    setKeywordInput("");
  }

  // إضافة مصدر نصي: مباشرة للخادم في التعديل، أو محلياً في الإنشاء
  async function addTextSource() {
    if (!sourceTitle.trim() || !sourceContent.trim()) return;
    if (isEdit) {
      const res = await fetch(`/api/agents/${agent!.id}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sourceTitle, content: sourceContent }),
      });
      if (res.ok) {
        const data = await res.json();
        setSources([...sources, data.source]);
      }
    } else {
      setPendingSources([
        ...pendingSources,
        { title: sourceTitle.trim(), content: sourceContent.trim() },
      ]);
    }
    setSourceTitle("");
    setSourceContent("");
  }

  // رفع ملف PDF/Word — متاح فقط بعد إنشاء الوكيل
  async function uploadFile(file: File) {
    if (!isEdit) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/agents/${agent!.id}/knowledge`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        setSources((prev) => [...prev, data.source]);
      } else {
        setError(data.error ?? "فشل رفع الملف");
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteSource(id: string) {
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (res.ok) setSources(sources.filter((s) => s.id !== id));
  }

  // حمولة مصدر DB المشتركة بين الاختبار والحفظ
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

  // اختبار الاتصال والاستعلام: يُنفَّذ برقم تجريبي ويعرض عينة من النتائج
  async function testDbSource() {
    if (!isEdit) return;
    setDbTesting(true);
    setDbTestResult(null);
    try {
      const res = await fetch(`/api/agents/${agent!.id}/knowledge`, {
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

  // حفظ مصدر قاعدة البيانات — متاح فقط بعد إنشاء الوكيل
  async function addDbSource() {
    if (!isEdit) return;
    const res = await fetch(`/api/agents/${agent!.id}/knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dbPayload(false)),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setSources((prev) => [...prev, data.source]);
      setDbTitle("");
      setDbQuery("");
      setDbTestResult(null);
    } else {
      setError(data?.error ?? "فشل حفظ مصدر قاعدة البيانات");
    }
  }

  // حفظ الوكيل: إنشاء مع مصادره المعلّقة، أو تحديث
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      name,
      systemPrompt,
      welcomeMessage,
      responseDelaySec,
      handoffKeywords,
      isActive,
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
    router.push("/agents");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* أ. الإعداد والتجربة */}
      <Card>
        <CardHeader>
          <CardTitle>الإعداد والتجربة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-name">اسم الوكيل</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: مساعد المتجر"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="system-prompt">تعليمات النظام</Label>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="أنت مساعد تدريب رياضي في نادٍ، أجب بأسلوب مهني واقتبس من قائمة الأسعار"
              rows={4}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="welcome-message">رسالة الترحيب</Label>
            <Textarea
              id="welcome-message"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="أهلاً بك! كيف أقدر أساعدك اليوم؟"
              rows={2}
            />
          </div>
          <TestChat systemPrompt={systemPrompt} knowledge={allKnowledge} />
        </CardContent>
      </Card>

      {/* ب. المصادر (قاعدة المعرفة) */}
      <Card>
        <CardHeader>
          <CardTitle>المصادر (قاعدة المعرفة)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* المصادر الحالية */}
          {sources.length + pendingSources.length > 0 && (
            <div className="space-y-2">
              {sources.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {s.title}
                      </span>
                      <Badge
                        variant={
                          s.type === "FILE"
                            ? "default"
                            : s.type === "DB"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {s.type === "FILE" ? "ملف" : s.type === "DB" ? "قاعدة بيانات" : "نص"}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {s.content}
                    </p>
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
              ))}
              {pendingSources.map((s, i) => (
                <div
                  key={`pending-${i}`}
                  className="flex items-start justify-between gap-2 rounded-md border border-dashed p-3"
                >
                  <div className="min-w-0">
                    <span className="truncate text-sm font-medium">
                      {s.title}
                    </span>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {s.content}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setPendingSources(pendingSources.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* إضافة مصدر نصي */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              إضافة نص
            </div>
            <Input
              value={sourceTitle}
              onChange={(e) => setSourceTitle(e.target.value)}
              placeholder="عنوان المصدر (مثال: قائمة الأسعار)"
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
                احفظ الوكيل أولاً لتتمكن من رفع الملفات — يمكنك إضافة نصوص الآن
              </p>
            )}
          </div>

          {/* ربط قاعدة بيانات خارجية — يقرأ منها الوكيل عند كل رسالة */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Database className="h-4 w-4" />
              ربط قاعدة بيانات (MySQL / Postgres)
            </div>
            <p className="text-xs text-muted-foreground">
              يقرأ الوكيل من جداول عملاءك ويردّ بناءً عليها مع مصادر المعرفة
              الأخرى. استخدم <code dir="ltr">{"{{phone}}"}</code> داخل الاستعلام
              ليُستبدل برقم العميل تلقائياً (استعلامات SELECT فقط).
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={dbTitle}
                onChange={(e) => setDbTitle(e.target.value)}
                placeholder="عنوان المصدر (مثال: بيانات العملاء)"
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
                placeholder="الخادم — مثال: db.example.com"
                dir="ltr"
              />
              <Input
                value={dbPort}
                onChange={(e) => setDbPort(e.target.value)}
                placeholder="المنفذ (3306 / 5432)"
                dir="ltr"
              />
              <Input
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder="اسم القاعدة"
                dir="ltr"
              />
              <Input
                value={dbUser}
                onChange={(e) => setDbUser(e.target.value)}
                placeholder="اسم المستخدم"
                dir="ltr"
              />
              <Input
                type="password"
                value={dbPassword}
                onChange={(e) => setDbPassword(e.target.value)}
                placeholder="كلمة المرور"
                dir="ltr"
              />
            </div>
            <Textarea
              value={dbQuery}
              onChange={(e) => setDbQuery(e.target.value)}
              placeholder={'SELECT name, balance FROM customers WHERE phone = {{phone}}'}
              rows={3}
              dir="ltr"
              className="text-left font-mono text-xs"
            />
            {dbTestResult && (
              <pre
                className={`max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border p-2 text-xs ${
                  dbTestResult.ok
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
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
                  disabled={
                    dbTesting ||
                    !dbTitle.trim() ||
                    !dbHost.trim() ||
                    !dbQuery.trim()
                  }
                >
                  {dbTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                  {dbTesting ? "جارٍ الاختبار…" : "اختبار الاتصال"}
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
        </CardContent>
      </Card>

      {/* ج. الردود والتسليم */}
      <Card>
        <CardHeader>
          <CardTitle>الردود والتسليم</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              {QUICK_KEYWORDS.filter((k) => !handoffKeywords.includes(k)).map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => addKeyword(k)}
                    className="rounded-md border px-2 py-0.5 hover:bg-muted"
                  >
                    {k}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delay">وقت الانتظار قبل الرد (بالثواني)</Label>
            <Input
              id="delay"
              type="number"
              min={0}
              value={responseDelaySec}
              onChange={(e) => setResponseDelaySec(Number(e.target.value) || 0)}
              className="w-32"
              dir="ltr"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            تفعيل الوكيل
          </label>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "حفظ التعديلات" : "إنشاء الوكيل"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/agents")}
        >
          إلغاء
        </Button>
      </div>
    </form>
  );
}
