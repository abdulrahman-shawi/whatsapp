"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BellRing,
  Check,
  CheckCheck,
  Clock,
  FileText,
  ListCollapse,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  StickyNote,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { messageTime, dateTime } from "@/lib/time";
import type {
  CannedResponse,
  ConversationListItem,
  MemberInfo,
  MessageItem,
  ScheduledMessage,
  TemplateInfo,
} from "./types";

type Props = {
  conversation: ConversationListItem;
  messages: MessageItem[];
  loading: boolean;
  members: MemberInfo[];
  currentUserId: string;
  onSend: (body: string, isNote: boolean) => void;
  onSendMedia: (file: File, caption: string) => void;
  onSendTemplate: (templateId: string, params: string[]) => void;
  onToggleStatus: () => void;
  onToggleArchive: () => void;
  // استبدال قائمة المسند إليهم بالكامل (مصفوفة فارغة = إلغاء الإسناد)
  onAssign: (userIds: string[]) => void;
  onToggleClosed: () => void;
  // تحديث القائمة بعد تغيير موعد المتابعة
  onFollowUpChanged?: () => void;
};

// مسميات عربية لأنواع الوسائط
const mediaLabels: Record<string, string> = {
  image: "صورة",
  document: "مستند",
  audio: "رسالة صوتية",
  video: "مقطع فيديو",
};

// نافذة المحادثة: الرسائل + الوسائط + القوالب + شريط الاقتراح الذكي + حقل الإرسال
export function ChatWindow({
  conversation,
  messages,
  loading,
  members,
  currentUserId,
  onSend,
  onSendMedia,
  onSendTemplate,
  onToggleStatus,
  onToggleArchive,
  onAssign,
  onToggleClosed,
  onFollowUpChanged,
}: Props) {
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  // الردود الجاهزة: قائمة + نافذة الإدراج والإدارة
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [newShortcut, setNewShortcut] = useState("");
  const [newCannedBody, setNewCannedBody] = useState("");
  // الرسائل المجدولة: نافذة الجدولة + القائمة المعلّقة
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);
  const [schedBody, setSchedBody] = useState("");
  const [schedAt, setSchedAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  // موعد متابعة المحادثة
  const [followUpAt, setFollowUpAt] = useState<string | null>(
    conversation.followUpAt
  );
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState("");
  // تقييم ردود الذكاء الاصطناعي (تدريب الوكيل) — يُحقن "الجيد" في البرومبت
  const [ratings, setRatings] = useState<Record<string, string | null>>({});
  // ملخص المحادثة بالذكاء الاصطناعي للموظف المتسلم
  const [summary, setSummary] = useState<string | null>(conversation.summary);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  // منتقي القوالب
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateInfo | null>(
    null
  );
  const [templateParams, setTemplateParams] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // تنظيف الحقول عند تبديل المحادثة + تحميل الردود الجاهزة والمجدولة لها
  useEffect(() => {
    setText("");
    setPendingFile(null);
    setSuggestion(null);
    setIsNoteMode(false);
    setSelectedTemplate(null);
    setTemplateParams({});
    setTemplatePickerOpen(false);
    setAssignOpen(false);
    setCannedOpen(false);
    setScheduleOpen(false);
    setFollowUpOpen(false);
    setFollowUpAt(conversation.followUpAt);
    setFollowUpDraft("");
    setRatings({});
    setSummary(conversation.summary);
    setSummaryOpen(false);
    let cancelled = false;
    fetch("/api/canned-responses")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setCanned(data.items);
      })
      .catch(() => {});
    fetch(`/api/conversations/${conversation.id}/scheduled`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setScheduled(data.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversation.id, conversation.followUpAt]);

  // التمرير لأسفل عند وصول رسائل جديدة
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const isManual = conversation.status === "MANUAL";
  const isClosed = conversation.closedAt !== null;

  // اختصار "/": كتابته أول الحقل تفتح قائمة الردود الجاهزة المطابقة
  const slashQuery = text.startsWith("/") && !text.slice(1).includes(" ")
    ? text.slice(1).toLowerCase()
    : null;
  const slashMatches =
    slashQuery !== null
      ? canned
          .filter((c) => c.shortcut.toLowerCase().includes(slashQuery))
          .slice(0, 6)
      : [];

  // خيارات متابعة سريعة: "ذكّرني بها بعد ساعتين"
  const toLocalInput = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const followUpPresets: { label: string; date: () => Date }[] = [
    { label: "بعد ساعة", date: () => new Date(Date.now() + 60 * 60 * 1000) },
    { label: "بعد ساعتين", date: () => new Date(Date.now() + 2 * 60 * 60 * 1000) },
    {
      label: "غداً ٩ ص",
      date: () => {
        const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
  ];

  // ضبط موعد متابعة مباشرة (للخيارات السريعة)
  async function handleQuickFollowUp(date: Date) {
    const res = await fetch(`/api/conversations/${conversation.id}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpAt: date.toISOString() }),
    });
    if (res.ok) {
      setFollowUpAt(date.toISOString());
      setFollowUpOpen(false);
      onFollowUpChanged?.();
    }
  }

  // تقييم رد ذكاء اصطناعي: يُحفظ ويُحقن "الجيد" منه في برومبت الوكيل مستقبلاً
  async function handleRate(messageId: string, value: "GOOD" | "NEEDS_IMPROVEMENT") {
    await fetch(`/api/conversations/${conversation.id}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, rating: value }),
    });
    setRatings((prev) => ({ ...prev, [messageId]: value }));
  }

  // تلخيص المحادثة بالذكاء الاصطناعي للموظف الجديد المتسلم
  async function handleSummarize(force = false) {
    setSummaryOpen(true);
    if (summary && !force) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(
        `/api/conversations/${conversation.id}/summary${force ? "?force=true" : ""}`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data?.summary) {
        setSummary(data.summary);
      } else {
        alert(data?.error ?? "تعذّر تلخيص المحادثة");
      }
    } finally {
      setSummaryLoading(false);
    }
  }

  // متغيرات القالب المحدد: {{1}} {{2}}... مرتبة رقمياً
  const templateVars: number[] = selectedTemplate
    ? [
        ...new Set(
          [...selectedTemplate.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
            parseInt(m[1], 10)
          )
        ),
      ].sort((a, b) => a - b)
    : [];

  // طلب اقتراح رد من الذكاء الاصطناعي
  async function handleSuggest() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/suggest`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestion(data.suggestion);
      }
    } finally {
      setSuggesting(false);
    }
  }

  // فتح منتقي القوالب وتحميل القائمة مرة واحدة
  async function handleOpenTemplates() {
    setTemplatePickerOpen((v) => !v);
    setSelectedTemplate(null);
    if (templates.length === 0) {
      try {
        const res = await fetch("/api/templates");
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates);
        }
      } catch {
        // تجاهل أخطاء الشبكة
      }
    }
  }

  function handleSelectTemplate(t: TemplateInfo) {
    setSelectedTemplate(t);
    setTemplateParams({});
  }

  function handleSendTemplate() {
    if (!selectedTemplate) return;
    const maxVar = templateVars.length > 0 ? Math.max(...templateVars) : 0;
    const params = Array.from(
      { length: maxVar },
      (_, i) => templateParams[i + 1] ?? ""
    );
    onSendTemplate(selectedTemplate.id, params);
    setSelectedTemplate(null);
    setTemplateParams({});
    setTemplatePickerOpen(false);
  }

  function handleSend() {
    // رفع الوسائط: يرسل الملف الفعلي مع التسمية التوضيحية من الحقل
    if (pendingFile) {
      setSendingMedia(true);
      try {
        onSendMedia(pendingFile, text.trim());
      } finally {
        setSendingMedia(false);
      }
      setText("");
      setPendingFile(null);
      setSuggestion(null);
      return;
    }
    const typed = text.trim();
    if (!typed) return;
    // قائمة الاختصار "/": الإدخال يختار أول مطابقة بدل الإرسال
    if (slashMatches.length > 0) {
      handleInsertCanned(slashMatches[0]);
      return;
    }
    // الردود الجاهزة: نص مكوّن من اختصار مسجّل فقط يُستبدل بالنص الكامل
    const cannedMatch = canned.find((c) => c.shortcut === typed);
    onSend(cannedMatch ? cannedMatch.body : typed, isNoteMode);
    setText("");
    setSuggestion(null);
  }

  // إدراج رد جاهز في خانة الإرسال
  function handleInsertCanned(item: CannedResponse) {
    setText(item.body);
    setCannedOpen(false);
  }

  // حفظ رد جاهز جديد (المالك — غيره يظهر له تنبيه بالخطأ)
  async function handleSaveCanned() {
    const shortcut = newShortcut.trim();
    const body = newCannedBody.trim();
    if (!shortcut || !body) return;
    const res = await fetch("/api/canned-responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut, body }),
    });
    if (res.ok) {
      const data = await res.json();
      setCanned((prev) => {
        const rest = prev.filter((c) => c.shortcut !== data.item.shortcut);
        return [data.item, ...rest];
      });
      setNewShortcut("");
      setNewCannedBody("");
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error ?? "تعذّر حفظ الرد الجاهز");
    }
  }

  async function handleDeleteCanned(id: string) {
    const res = await fetch(`/api/canned-responses?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCanned((prev) => prev.filter((c) => c.id !== id));
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error ?? "تعذّر حذف الرد الجاهز");
    }
  }

  // جدولة رسالة لموعد لاحق — تُرسل تلقائياً من الكرون
  async function handleSchedule() {
    const body = schedBody.trim();
    if (!body || !schedAt) return;
    setScheduling(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/scheduled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, sendAt: new Date(schedAt).toISOString() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setScheduled((prev) =>
          [...prev, data.item].sort((a, b) => a.sendAt.localeCompare(b.sendAt))
        );
        setSchedBody("");
        setSchedAt("");
      } else {
        alert(data?.error ?? "تعذّرت جدولة الرسالة");
      }
    } finally {
      setScheduling(false);
    }
  }

  async function handleCancelScheduled(id: string) {
    const res = await fetch(
      `/api/conversations/${conversation.id}/scheduled?id=${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setScheduled((prev) => prev.filter((s) => s.id !== id));
    }
  }

  // ضبط / إلغاء موعد متابعة المحادثة
  async function handleSaveFollowUp() {
    const value = followUpDraft ? new Date(followUpDraft).toISOString() : null;
    if (followUpDraft && isNaN(new Date(followUpDraft).getTime())) return;
    const res = await fetch(`/api/conversations/${conversation.id}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpAt: value }),
    });
    if (res.ok) {
      setFollowUpAt(value);
      setFollowUpOpen(false);
      onFollowUpChanged?.();
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.error ?? "تعذّر حفظ موعد المتابعة");
    }
  }

  // عرض محتوى وسائط رسالة عبر وسيط /api/media
  function renderMedia(m: MessageItem) {
    if (!m.mediaId) return null;
    const url = `/api/media?id=${encodeURIComponent(m.mediaId)}`;
    switch (m.mediaType) {
      case "image":
        return (
          <a href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={m.body}
              className="max-h-64 rounded-md"
            />
          </a>
        );
      case "audio":
        // eslint-disable-next-line jsx-a11y/media-has-caption
        return <audio controls src={url} className="max-w-full" />;
      case "video":
        // eslint-disable-next-line jsx-a11y/media-has-caption
        return <video controls src={url} className="max-h-64 rounded-md" />;
      default:
        return (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 underline"
          >
            <FileText className="h-5 w-5 shrink-0" />
            <span className="break-all">{m.body.startsWith("[") ? "تحميل الملف" : m.body}</span>
          </a>
        );
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ترويسة المحادثة — تلتف أزرارها لسطر ثانٍ عند ضيق المساحة */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {conversation.contact.name ?? conversation.contact.waPhone}
          </p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {conversation.contact.waPhone}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {/* إسناد المحادثة لأعضاء الفريق — تحديد متعدد من قائمة منسدلة */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              title="إسناد المحادثة لموظفين"
              onClick={() => setAssignOpen((v) => !v)}
            >
              <User className="h-4 w-4" />
              {conversation.assignees.length > 0 ? (
                <span className="max-w-32 truncate">
                  {conversation.assignees.map((a) => a.name).join("، ")}
                </span>
              ) : (
                "إسناد"
              )}
            </Button>
            {assignOpen && (
              <>
                {/* خلفية شفافة لإغلاق القائمة عند النقر خارجها */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setAssignOpen(false)}
                />
                <div className="absolute end-0 top-full z-20 mt-1 w-56 rounded-md border bg-background p-1 shadow-lg">
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    المسند إليهم ({conversation.assignees.length})
                  </p>
                  {members.map((m) => {
                    const checked = conversation.assignees.some(
                      (a) => a.id === m.id
                    );
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          const current = conversation.assignees.map(
                            (a) => a.id
                          );
                          onAssign(
                            checked
                              ? current.filter((id) => id !== m.id)
                              : [...current, m.id]
                          );
                        }}
                        className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <span className="truncate">
                          {m.name}
                          {m.id === currentUserId ? " (أنا)" : ""}
                        </span>
                        {checked && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                  {conversation.assignees.length > 0 && (
                    <button
                      onClick={() => onAssign([])}
                      className="flex w-full items-center rounded-sm border-t px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                    >
                      <X className="me-1 h-4 w-4" />
                      إلغاء الإسناد
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* متابعة المحادثة: موعد يظهر في قائمة "متابعات" */}
          <div className="relative">
            <Button
              variant={followUpAt ? "secondary" : "outline"}
              size="sm"
              title={
                followUpAt
                  ? `موعد المتابعة: ${dateTime(followUpAt)}`
                  : "ضبط موعد متابعة"
              }
              onClick={() => {
                setFollowUpOpen((v) => !v);
                setFollowUpDraft(
                  followUpAt ? followUpAt.slice(0, 16) : ""
                );
              }}
            >
              <BellRing className="h-4 w-4" />
              {followUpAt ? dateTime(followUpAt) : "متابعة"}
            </Button>
            {followUpOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setFollowUpOpen(false)}
                />
                <div className="absolute end-0 top-full z-20 mt-1 w-64 rounded-md border bg-background p-2 shadow-lg">
                  <p className="mb-1 text-xs text-muted-foreground">
                    موعد المتابعة القادم
                  </p>
                  {/* خيارات سريعة: ذكّرني بها بعد ساعتين */}
                  <div className="mb-2 flex gap-1">
                    {followUpPresets.map((preset) => (
                      <Button
                        key={preset.label}
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 text-xs"
                        onClick={() => handleQuickFollowUp(preset.date())}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <input
                    type="datetime-local"
                    value={followUpDraft}
                    onChange={(e) => setFollowUpDraft(e.target.value)}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                  <div className="mt-2 flex items-center gap-1">
                    <Button size="sm" onClick={handleSaveFollowUp}>
                      حفظ
                    </Button>
                    {followUpAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFollowUpDraft("");
                          setFollowUpAt(null);
                          fetch(`/api/conversations/${conversation.id}/followup`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ followUpAt: null }),
                          }).then(() => onFollowUpChanged?.());
                          setFollowUpOpen(false);
                        }}
                      >
                        إلغاء المتابعة
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* تلخيص المحادثة بالذكاء — للموظف الجديد المتسلم */}
          <Button
            variant={summaryOpen ? "secondary" : "ghost"}
            size="sm"
            title="ملخص المحادثة بالذكاء الاصطناعي"
            onClick={() => (summaryOpen ? setSummaryOpen(false) : handleSummarize())}
          >
            {summaryLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ListCollapse className="h-4 w-4" />
            )}
            ملخص
          </Button>

          {/* إغلاق / إعادة فتح المحادثة */}
          <Button
            variant={isClosed ? "secondary" : "ghost"}
            size="sm"
            title={isClosed ? "إعادة فتح المحادثة" : "إغلاق المحادثة"}
            onClick={onToggleClosed}
          >
            {isClosed ? (
              <>
                <CheckCheck className="h-4 w-4" />
                مغلقة
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                إغلاق
              </>
            )}
          </Button>

          <Button
            variant={isManual ? "secondary" : "default"}
            size="sm"
            onClick={onToggleStatus}
          >
            {isManual ? "إعادة الرد الآلي" : "دخول المحادثة"}
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleArchive}>
            {conversation.isArchived ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* تنبيه عند التحكم اليدوي أو الإغلاق */}
      {isManual && (
        <div className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-700">
          أنت تتحكم الآن — الرد الآلي متوقف
        </div>
      )}
      {isClosed && (
        <div className="border-b bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-700">
          محادثة مغلقة — رسالة العميل الجديدة ستلغي الإغلاق وتعيدها للوارد
        </div>
      )}

      {/* ملخص المحادثة المولّد بالذكاء الاصطناعي */}
      {summaryOpen && (
        <div className="border-b bg-violet-50 px-4 py-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-medium text-violet-700">
              ملخص المحادثة — للموظف المتسلم
            </p>
            <div className="flex items-center gap-2">
              <button
                className="text-xs text-violet-600 hover:underline"
                onClick={() => handleSummarize(true)}
                disabled={summaryLoading}
              >
                تحديث الملخص
              </button>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSummaryOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {summaryLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              يجري تلخيص المحادثة…
            </p>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-violet-900">
              {summary ?? "لا ملخص بعد — اضغط تحديث الملخص"}
            </p>
          )}
        </div>
      )}

      {/* منطقة الرسائل */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-muted/30 p-4"
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            لا توجد رسائل في هذه المحادثة
          </p>
        ) : (
          messages.map((m) => {
            // الملاحظات الداخلية: خلفية مميزة لا تُرسل للعميل
            if (m.isNote) {
              return (
                <div
                  key={m.id}
                  className="max-w-[75%] self-stretch rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm shadow-sm"
                >
                  <div className="mb-1 flex items-center gap-1">
                    <StickyNote className="h-3 w-3 text-amber-600" />
                    <Badge
                      variant="outline"
                      className="border-amber-300 px-1 py-0 text-[9px] text-amber-700"
                    >
                      ملاحظة داخلية
                    </Badge>
                    {m.senderName && (
                      <span className="text-[10px] text-amber-700">
                        {m.senderName}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    <span>{messageTime(m.createdAt)}</span>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className={cn(
                  "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm",
                  m.direction === "INBOUND"
                    ? "self-start border bg-card"
                    : "self-end bg-[#d9fdd3]"
                )}
              >
                {/* محتوى الوسائط إن وُجد */}
                {m.mediaId && <div className="mb-1">{renderMedia(m)}</div>}
                {/* التسمية التوضيحية أو نص الرسالة (نتجاهل نص العنصر النائب للوسائط) */}
                {(!m.mediaId || !m.body.startsWith("[")) && (
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                )}
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                  {m.direction === "OUTBOUND" && m.senderType === "AI" && (
                    <Badge variant="outline" className="px-1 py-0 text-[9px]">
                      آلي
                    </Badge>
                  )}
                  {/* تقييم الرد الآلي: الجيد يُحقن كمثال في برومبت الوكيل */}
                  {m.direction === "OUTBOUND" && m.senderType === "AI" && (
                    <span className="flex items-center gap-0.5">
                      <button
                        title="رد جيد — يُستخدم في تدريب الوكيل"
                        className={`rounded p-0.5 hover:bg-muted ${
                          (ratings[m.id] ?? m.rating) === "GOOD"
                            ? "text-emerald-600"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => handleRate(m.id, "GOOD")}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      <button
                        title="رد يحتاج تحسيناً"
                        className={`rounded p-0.5 hover:bg-muted ${
                          (ratings[m.id] ?? m.rating) === "NEEDS_IMPROVEMENT"
                            ? "text-red-500"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => handleRate(m.id, "NEEDS_IMPROVEMENT")}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  <span>{messageTime(m.createdAt)}</span>
                  {m.direction === "OUTBOUND" && (
                    <CheckCheck className="h-3 w-3" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* شريط الاقتراح الذكي */}
      <div className="border-t px-3 pt-2">
        {suggestion ? (
          <div className="mb-2 flex items-start gap-2 rounded-md border bg-accent p-2">
            <button
              className="flex-1 text-start text-sm"
              title="اضغط لتعبئة حقل الإرسال"
              onClick={() => {
                setText(suggestion);
                setSuggestion(null);
              }}
            >
              {suggestion}
            </button>
            <button
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setSuggestion(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="mb-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={handleSuggest}
              disabled={suggesting}
            >
              {suggesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              اقتراح رد
            </Button>
            {/* فتح منتقي قوالب الرسائل */}
            <Button
              variant={templatePickerOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={handleOpenTemplates}
            >
              <FileText className="h-4 w-4" />
              قالب
            </Button>
          </div>
        )}
      </div>

      {/* منتقي القوالب */}
      {templatePickerOpen && (
        <div className="border-t bg-accent/50 px-3 py-2">
          {selectedTemplate ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{selectedTemplate.name}</p>
              <p className="text-xs text-muted-foreground">
                {selectedTemplate.body}
              </p>
              {templateVars.map((n) => (
                <Input
                  key={n}
                  value={templateParams[n] ?? ""}
                  onChange={(e) =>
                    setTemplateParams((prev) => ({
                      ...prev,
                      [n]: e.target.value,
                    }))
                  }
                  placeholder={`قيمة المتغير {{${n}}}`}
                  className="bg-background"
                />
              ))}
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSendTemplate}>
                  <Send className="h-4 w-4" />
                  إرسال القالب
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTemplate(null)}
                >
                  رجوع
                </Button>
              </div>
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا توجد قوالب — أضفها من صفحة الإعدادات
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className="rounded-md border bg-background p-2 text-start text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="ms-2 text-xs text-muted-foreground">
                    {t.language}
                  </span>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {t.body}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* حقل الإرسال — يلتف عند ضيق المساحة */}
      <div className="relative flex flex-wrap items-center gap-2 border-t p-3">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,audio/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*"
          onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
        />
        <Button
          variant="ghost"
          size="icon"
          title={pendingFile ? "ملف جاهز للإرسال" : "إرفاق ملف (صورة/مستند/صوت/فيديو)"}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        {/* الردود الجاهزة */}
        <div className="relative">
          <Button
            variant={cannedOpen ? "secondary" : "ghost"}
            size="icon"
            title="الردود الجاهزة — اختر للإدراج، أو اكتب الاختصار وحده وأرسل"
            onClick={() => setCannedOpen((v) => !v)}
          >
            <Zap className="h-4 w-4" />
          </Button>
          {cannedOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setCannedOpen(false)}
              />
              <div className="absolute bottom-full start-0 z-20 mb-1 w-80 rounded-md border bg-background p-2 shadow-lg">
                <p className="mb-1 px-1 text-xs text-muted-foreground">
                  الردود الجاهزة — النقر يدرج النص في خانة الإرسال
                </p>
                <div className="max-h-56 overflow-y-auto">
                  {canned.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">
                      لا ردود جاهزة بعد — أضف أول رد بالأسفل
                    </p>
                  ) : (
                    canned.map((c) => (
                      <div
                        key={c.id}
                        className="group flex items-start gap-1 rounded-sm p-1 hover:bg-muted"
                      >
                        <button
                          onClick={() => handleInsertCanned(c)}
                          className="min-w-0 flex-1 text-start"
                        >
                          <Badge variant="outline" className="me-1">
                            {c.shortcut}
                          </Badge>
                          <span className="line-clamp-2 text-xs text-muted-foreground">
                            {c.body}
                          </span>
                        </button>
                        <button
                          className="shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                          title="حذف الرد الجاهز"
                          onClick={() => handleDeleteCanned(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                {/* إضافة رد جاهز جديد */}
                <div className="mt-2 flex flex-col gap-1 border-t pt-2">
                  <div className="flex gap-1">
                    <Input
                      value={newShortcut}
                      onChange={(e) => setNewShortcut(e.target.value)}
                      placeholder="اختصار (مثال: س1)"
                      className="h-8 w-24 text-xs"
                    />
                    <Input
                      value={newCannedBody}
                      onChange={(e) => setNewCannedBody(e.target.value)}
                      placeholder="نص الرد الكامل"
                      className="h-8 flex-1 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={handleSaveCanned}
                    disabled={!newShortcut.trim() || !newCannedBody.trim()}
                  >
                    حفظ رد جاهز (للمالك)
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* الرسائل المجدولة */}
        <div className="relative">
          <Button
            variant={scheduleOpen ? "secondary" : "ghost"}
            size="icon"
            title="جدولة رسالة لموعد لاحق"
            onClick={() => setScheduleOpen((v) => !v)}
          >
            <Clock className="h-4 w-4" />
          </Button>
          {scheduleOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setScheduleOpen(false)}
              />
              <div className="absolute bottom-full start-0 z-20 mb-1 w-80 rounded-md border bg-background p-2 shadow-lg">
                <p className="mb-1 px-1 text-xs text-muted-foreground">
                  تُرسل تلقائياً في موعدها — حتى مع غلق الصفحة
                </p>
                <textarea
                  value={schedBody}
                  onChange={(e) => setSchedBody(e.target.value)}
                  placeholder="نص الرسالة المجدولة…"
                  rows={2}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                />
                <div className="mt-1 flex items-center gap-1">
                  <input
                    type="datetime-local"
                    value={schedAt}
                    onChange={(e) => setSchedAt(e.target.value)}
                    className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleSchedule}
                    disabled={scheduling || !schedBody.trim() || !schedAt}
                  >
                    {scheduling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "جدولة"
                    )}
                  </Button>
                </div>
                {scheduled.length > 0 && (
                  <div className="mt-2 border-t pt-1">
                    <p className="px-1 py-1 text-xs text-muted-foreground">
                      بانتظار الإرسال ({scheduled.length})
                    </p>
                    {scheduled.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-sm p-1 text-xs hover:bg-muted"
                      >
                        <div className="flex items-center gap-1">
                          <span className="shrink-0 font-medium text-primary">
                            {dateTime(s.sendAt)}
                          </span>
                          <span className="line-clamp-1 flex-1 text-muted-foreground">
                            {s.body}
                          </span>
                          <button
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            title="إلغاء الجدولة"
                            onClick={() => handleCancelScheduled(s.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {/* سبب فشل آخر محاولة إرسال (إن توقفت المحاولات) */}
                        {s.lastError && s.attempts >= 5 && (
                          <p className="mt-0.5 truncate text-destructive" title={s.lastError}>
                            توقفت المحاولات: {s.lastError}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* تبديل الملاحظة الداخلية: لا تُرسل للعميل */}
        <Button
          variant={isNoteMode ? "default" : "ghost"}
          size="icon"
          title={isNoteMode ? "وضع الملاحظة الداخلية (مفعّل)" : "تحويل الإرسال إلى ملاحظة داخلية"}
          onClick={() => setIsNoteMode((v) => !v)}
        >
          <StickyNote className="h-4 w-4" />
        </Button>

        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !pendingFile) handleSend();
          }}
          placeholder={
            isNoteMode
              ? "اكتب ملاحظة داخلية — لن تُرسل للعميل…"
              : pendingFile
                ? `📎 ${pendingFile.name} — أضف تعليقاً…`
                : "اكتب رسالة… (ابدأ بـ / للردود الجاهزة)"
          }
          className={cn("flex-1", isNoteMode && "border-amber-400 bg-amber-50")}
        />
        {/* قائمة الردود الجاهزة عند كتابة / في أول الحقل */}
        {slashMatches.length > 0 && (
          <div className="absolute bottom-full start-10 z-20 mb-1 w-80 rounded-md border bg-background p-1 shadow-lg">
            {slashMatches.map((c) => (
              <button
                key={c.id}
                onClick={() => handleInsertCanned(c)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-muted"
              >
                <Badge variant="outline" className="shrink-0">
                  /{c.shortcut}
                </Badge>
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {c.body}
                </span>
              </button>
            ))}
          </div>
        )}
        <Button
          size="icon"
          onClick={handleSend}
          disabled={(!text.trim() && !pendingFile) || sendingMedia}
        >
          {sendingMedia ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
