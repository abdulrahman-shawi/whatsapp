"use client";

import { useState } from "react";
import { Loader2, Send, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TestMessage = { role: "user" | "assistant"; content: string };

type ChatResponse = {
  reply: string;
  fallback?: boolean;
  previewOnly?: boolean;
  toolCalls?: { name: string; argumentsJson: string }[];
  executedTools?: { name: string; result: string }[];
};

// صندوق تجربة حي: يرسل حالة الاستوديو الحالية دون حفظها.
// لوكيل محفوظ (agentId) يُبنى البرومبت من قاعدة البيانات وتعمل المهارات بأدواتها؛
// وإلا تُرسل حالة المسودة (تعليمات + مهارات + معرفة) مباشرة.
export function TestChat({
  agentId,
  systemPrompt,
  instructions,
  skills,
  knowledge,
}: {
  agentId?: string;
  systemPrompt: string;
  instructions?: { id: string; title: string; content: string }[];
  skills?: string[];
  knowledge: string[];
}) {
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [extras, setExtras] = useState<
    Record<number, { executedTools?: { name: string; result: string }[]; previewOnly?: boolean }>
  >({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const content = input.trim();
    if (!content || loading) return;

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agents/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          agentId
            ? { agentId, messages: next }
            : { systemPrompt, instructions, skills, knowledge, messages: next }
        ),
      });
      if (res.ok) {
        const data = (await res.json()) as ChatResponse;
        setMessages([...next, { role: "assistant", content: data.reply }]);
        if (data.executedTools?.length || data.previewOnly) {
          setExtras((prev) => ({
            ...prev,
            [next.length]: {
              executedTools: data.executedTools,
              previewOnly: data.previewOnly,
            },
          }));
        }
      } else {
        setMessages([
          ...next,
          { role: "assistant", content: "تعذّر الحصول على رد — حاول مجدداً" },
        ]);
      }
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "تعذّر الاتصال بالخادم" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-muted/30">
      <div className="border-b px-3 py-2 text-sm font-medium">تجربة الوكيل</div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="m-auto px-4 text-center text-xs text-muted-foreground">
            جرّب وكيلك هنا كأنك عميل — تظهر الإجراءات التي ينفّذها الوكيل أسفل ردّه
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "self-end rounded-bl-md bg-mint-soft text-navy"
                  : "self-start border bg-card"
              )}
            >
              {m.content}
            </div>
            {extras[i] && (
              <div className="self-start rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground">
                {extras[i].previewOnly ? (
                  <span>طلب الوكيل تنفيذ إجراءات — وضع المعاينة لا يُنفّذها فعلياً</span>
                ) : (
                  <ul className="space-y-0.5">
                    {extras[i].executedTools?.map((t, j) => (
                      <li key={j} className="flex items-center gap-1">
                        <Wrench className="h-3 w-3 shrink-0" />
                        <span dir="ltr">{t.name}</span>
                        <span>— {t.result}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="self-start rounded-lg border bg-card px-3 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t p-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="اكتب رسالة تجريبية…"
          className="h-8 text-sm"
        />
        <Button
          size="icon"
          className="h-8 w-8"
          onClick={handleSend}
          disabled={!input.trim() || loading}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
