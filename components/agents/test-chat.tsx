"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TestMessage = { role: "user" | "assistant"; content: string };

// صندوق تجربة حي: يرسل حالة النموذج الحالية دون حفظ أي شيء
export function TestChat({
  systemPrompt,
  knowledge,
}: {
  systemPrompt: string;
  knowledge: string[];
}) {
  const [messages, setMessages] = useState<TestMessage[]>([]);
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
        body: JSON.stringify({
          systemPrompt,
          knowledge,
          messages: next,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages([...next, { role: "assistant", content: data.reply }]);
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
    <div className="rounded-lg border bg-muted/30">
      <div className="border-b px-3 py-2 text-sm font-medium">تجربة</div>
      <div className="flex h-56 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="m-auto text-center text-xs text-muted-foreground">
            جرّب وكيلك هنا قبل الحفظ — أرسل رسالة كأنك عميل
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[80%] rounded-lg px-3 py-2 text-sm",
              m.role === "user"
                ? "self-end bg-[#d9fdd3]"
                : "self-start border bg-card"
            )}
          >
            {m.content}
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
