"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  CheckCheck,
  FileText,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  StickyNote,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { messageTime } from "@/lib/time";
import type {
  ConversationListItem,
  MemberInfo,
  MessageItem,
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
  onAssign: (userId: string | null) => void;
  onToggleClosed: () => void;
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
}: Props) {
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  // منتقي القوالب
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateInfo | null>(
    null
  );
  const [templateParams, setTemplateParams] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // تنظيف الحقول عند تبديل المحادثة
  useEffect(() => {
    setText("");
    setPendingFile(null);
    setSuggestion(null);
    setIsNoteMode(false);
    setSelectedTemplate(null);
    setTemplateParams({});
    setTemplatePickerOpen(false);
  }, [conversation.id]);

  // التمرير لأسفل عند وصول رسائل جديدة
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const isManual = conversation.status === "MANUAL";
  const isClosed = conversation.closedAt !== null;

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
    const body = text.trim();
    if (!body) return;
    onSend(body, isNoteMode);
    setText("");
    setSuggestion(null);
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
      {/* ترويسة المحادثة */}
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div>
          <p className="font-medium">
            {conversation.contact.name ?? conversation.contact.waPhone}
          </p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {conversation.contact.waPhone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* إسناد المحادثة لعضو في الفريق */}
          <div className="relative">
            <User className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={conversation.assignedTo?.id ?? ""}
              onChange={(e) => onAssign(e.target.value || null)}
              title="إسناد المحادثة"
              className="max-w-36 appearance-none rounded-md border bg-background py-1.5 ps-7 pe-2 text-sm"
            >
              <option value="">غير مسندة</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.id === currentUserId ? " (أنا)" : ""}
                </option>
              ))}
            </select>
          </div>

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

      {/* منطقة الرسائل */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto bg-muted/30 p-4"
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

      {/* حقل الإرسال */}
      <div className="flex items-center gap-2 border-t p-3">
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
                : "اكتب رسالة…"
          }
          className={cn("flex-1", isNoteMode && "border-amber-400 bg-amber-50")}
        />
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
