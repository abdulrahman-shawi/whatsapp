"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PreviewMsg = { role: "visitor" | "agent" | "system"; body: string };

// إعدادات المظهر المعروضة في المعاينة — تُمرَّر من لوحة الإعدادات
export type WidgetPreviewConfig = {
  title: string;
  subtitle: string;
  color: string;
};

// معاينة حية للويدجت: تتحدث مع الواجهة الحقيقية /api/widget
export function WidgetPreview({
  agentId,
  config,
}: {
  agentId: string;
  config?: WidgetPreviewConfig;
}) {
  const [messages, setMessages] = useState<PreviewMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // معرّف زائر خاص بالمعاينة ومفتاح المحادثة — لكل وكيل محادثة معاينة مستقلة
  const idsRef = useRef<{ visitorId: string; conversationId: string | null; lastTs: string | null; handedOff: boolean } | null>(null);
  if (!idsRef.current) {
    idsRef.current = {
      visitorId: `preview-${Math.random().toString(36).slice(2, 10)}`,
      conversationId: null,
      lastTs: null,
      handedOff: false,
    };
  }

  // تصفير المعاينة عند تغيير الوكيل
  useEffect(() => {
    setMessages([]);
    idsRef.current = {
      visitorId: `preview-${Math.random().toString(36).slice(2, 10)}`,
      conversationId: null,
      lastTs: null,
      handedOff: false,
    };
  }, [agentId]);

  // التمرير لأسفل مع كل رسالة
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function handleStatus(status?: string) {
    const ids = idsRef.current!;
    if (status === "HANDED_OFF" && !ids.handedOff) {
      ids.handedOff = true;
      setMessages((prev) => [
        ...prev,
        { role: "system", body: "تم تحويلك إلى فريق الدعم، سيرد عليك موظف قريباً" },
      ]);
    }
  }

  // استطلاع ردود الموظفين أثناء المعاينة
  useEffect(() => {
    const t = setInterval(async () => {
      const ids = idsRef.current!;
      if (!ids.conversationId) return;
      try {
        const res = await fetch(
          `/api/widget?conversationId=${ids.conversationId}` +
            (ids.lastTs ? `&since=${encodeURIComponent(ids.lastTs)}` : "")
        );
        if (!res.ok) return;
        const data = await res.json();
        const fresh = (data.messages ?? []).filter(
          (m: { createdAt: string }) => true
        );
        if (fresh.length > 0) {
          ids.lastTs = fresh[fresh.length - 1].createdAt;
          setMessages((prev) => [
            ...prev,
            ...fresh.map((m: { body: string }) => ({
              role: "agent" as const,
              body: m.body,
            })),
          ]);
        }
        handleStatus(data.status);
      } catch {
        /* تجاهل أخطاء الشبكة */
      }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "visitor", body: text }]);

    try {
      const ids = idsRef.current!;
      const res = await fetch("/api/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          visitorId: ids.visitorId,
          text,
          conversationId: ids.conversationId ?? undefined,
        }),
      });
      const data = await res.json();
      if (data.conversationId) ids.conversationId = data.conversationId;
      if (data.reply) {
        // الرد من POST يظهر فوراً؛ نحدّث التوقيت حتى لا يتكرر في الاستطلاع
        if (data.replyMessage) ids.lastTs = data.replyMessage.createdAt;
        setMessages((prev) => [...prev, { role: "agent", body: data.reply }]);
      }
      handleStatus(data.status);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "system", body: "تعذّر الإرسال — حاول مجدداً" },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[420px] w-full max-w-sm flex-col overflow-hidden rounded-xl border bg-card shadow">
      <div
        className="px-4 py-3 text-sm font-bold text-primary-foreground"
        style={
          /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(config?.color ?? "")
            ? { backgroundColor: config!.color }
            : undefined
        }
      >
        <div>{config?.title.trim() || "تحدث معنا"}</div>
        {config?.subtitle.trim() && (
          <div className="mt-0.5 text-xs font-normal opacity-90">
            {config.subtitle}
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto bg-muted/30 p-3"
      >
        {messages.length === 0 && (
          <p className="m-auto text-center text-xs text-muted-foreground">
            هذه معاينة حية — أرسل رسالة وسيرد الوكيل الحقيقي
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "system" ? (
            <p
              key={i}
              className="self-center text-center text-[11px] text-muted-foreground"
            >
              {m.body}
            </p>
          ) : (
            <div
              key={i}
              className={cn(
                "max-w-[78%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
                m.role === "visitor"
                  ? "self-end bg-[#d9fdd3]"
                  : "self-start border bg-card"
              )}
            >
              {m.body}
            </div>
          )
        )}
      </div>
      <div className="flex gap-2 border-t p-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="اكتب رسالتك…"
          className="h-8 text-sm"
        />
        <Button
          size="icon"
          className="h-8 w-8"
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
