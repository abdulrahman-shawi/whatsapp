"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CheckCheck,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { messageTime } from "@/lib/time";
import type { ConversationListItem, MessageItem } from "./types";

type Props = {
  conversation: ConversationListItem;
  messages: MessageItem[];
  loading: boolean;
  onSend: (body: string) => void;
  onToggleStatus: () => void;
  onToggleArchive: () => void;
};

// نافذة المحادثة: الرسائل + شريط الاقتراح الذكي + حقل الإرسال
export function ChatWindow({
  conversation,
  messages,
  loading,
  onSend,
  onToggleStatus,
  onToggleArchive,
}: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // تنظيف الحقول عند تبديل المحادثة
  useEffect(() => {
    setText("");
    setFileName(null);
    setSuggestion(null);
  }, [conversation.id]);

  // التمرير لأسفل عند وصول رسائل جديدة
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const isManual = conversation.status === "MANUAL";

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

  function handleSend() {
    // المرفقات حالياً: اسم الملف كسطر أول في نص الرسالة
    const body = fileName
      ? `📎 ${fileName}${text.trim() ? `\n${text.trim()}` : ""}`
      : text.trim();
    if (!body) return;
    onSend(body);
    setText("");
    setFileName(null);
    setSuggestion(null);
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

      {/* تنبيه عند التحكم اليدوي */}
      {isManual && (
        <div className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-700">
          أنت تتحكم الآن — الرد الآلي متوقف
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
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm",
                m.direction === "INBOUND"
                  ? "self-start border bg-card"
                  : "self-end bg-[#d9fdd3]"
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
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
          ))
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
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 text-primary"
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
        )}
      </div>

      {/* حقل الإرسال */}
      <div className="flex items-center gap-2 border-t p-3">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <Button
          variant="ghost"
          size="icon"
          title="إرفاق ملف"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={fileName ? `📎 ${fileName} — أضف تعليقاً…` : "اكتب رسالة…"}
          className="flex-1"
        />
        <Button size="icon" onClick={handleSend} disabled={!text.trim() && !fileName}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
