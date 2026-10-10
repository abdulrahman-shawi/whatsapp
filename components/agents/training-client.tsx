"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  MessagesSquare,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime, messageTime } from "@/lib/time";

type TrainingMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType: "AI" | "HUMAN" | "CUSTOMER";
  body: string;
  rating: string | null;
  createdAt: string;
};

type TrainingConversation = {
  id: string;
  platform: "WHATSAPP" | "WIDGET" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM";
  status: string;
  lastMessageAt: string;
  contactName: string | null;
  contactPhone: string;
  messages: TrainingMessage[];
};

// زوج سؤال/جواب: رسالة عميل يتبعها رد آلي
type QaPair = { question: TrainingMessage; answer: TrainingMessage };

// استخراج أزواج السؤال والجواب من سلسلة الرسائل
function extractPairs(messages: TrainingMessage[]): QaPair[] {
  const pairs: QaPair[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    if (
      messages[i].direction === "INBOUND" &&
      messages[i + 1].direction === "OUTBOUND" &&
      messages[i + 1].senderType === "AI"
    ) {
      pairs.push({ question: messages[i], answer: messages[i + 1] });
    }
  }
  return pairs;
}

export function TrainingClient({
  agentId,
  conversations,
}: {
  agentId: string;
  conversations: TrainingConversation[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    conversations[0]?.id ?? null
  );
  // التقييمات والإضافات المحفوظة محلياً (تُهيأ من قاعدة البيانات)
  const [ratings, setRatings] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const c of conversations)
      for (const m of c.messages) if (m.rating) initial[m.id] = m.rating;
    return initial;
  });
  const [addedToKnowledge, setAddedToKnowledge] = useState<
    Record<string, boolean>
  >({});

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const pairs = selected ? extractPairs(selected.messages) : [];

  // حفظ تقييم رد آلي
  async function rate(conversationId: string, messageId: string, rating: string) {
    setRatings((prev) => ({ ...prev, [messageId]: rating }));
    await fetch(`/api/conversations/${conversationId}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, rating }),
    });
  }

  // إضافة زوج سؤال/جواب إلى قاعدة معرفة الوكيل
  async function addToKnowledge(pair: QaPair) {
    const res = await fetch(`/api/agents/${agentId}/knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: pair.question.body.slice(0, 60),
        content: `س: ${pair.question.body}\nج: ${pair.answer.body}`,
      }),
    });
    if (res.ok) {
      setAddedToKnowledge((prev) => ({ ...prev, [pair.answer.id]: true }));
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] overflow-hidden rounded-xl border bg-card">
      {/* قائمة المحادثات */}
      <div className="w-72 shrink-0 overflow-y-auto border-e">
        {conversations.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            لا توجد محادثات لهذا الوكيل بعد
          </p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "flex w-full flex-col gap-1 border-b p-3 text-start transition-colors hover:bg-muted/50",
                selectedId === c.id && "bg-accent"
              )}
            >
              <span className="truncate font-medium">
                {c.contactName ?? c.contactPhone}
              </span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{relativeTime(c.lastMessageAt)}</span>
                {c.platform === "WIDGET" && (
                  <Badge variant="outline">من الموقع</Badge>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* أزواج الأسئلة والأجوبة */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessagesSquare className="h-10 w-10" />
            <p>اختر محادثة لعرضها</p>
          </div>
        ) : pairs.length === 0 ? (
          <p className="pt-16 text-center text-sm text-muted-foreground">
            لا توجد ردود آلية في هذه المحادثة بعد
          </p>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {pairs.map((pair) => {
              const rating = ratings[pair.answer.id];
              const added = addedToKnowledge[pair.answer.id];
              return (
                <div key={pair.answer.id} className="rounded-lg border p-4">
                  {/* السؤال والجواب */}
                  <div className="space-y-2">
                    <div className="rounded-md border bg-card p-2.5 text-sm">
                      <span className="mb-1 block text-xs text-muted-foreground">
                        العميل:
                      </span>
                      {pair.question.body}
                    </div>
                    <div className="rounded-md bg-[#d9fdd3] p-2.5 text-sm">
                      <span className="mb-1 block text-xs text-muted-foreground">
                        رد الوكيل ({messageTime(pair.answer.createdAt)}):
                      </span>
                      {pair.answer.body}
                    </div>
                  </div>

                  {/* أزرار التقييم والإضافة للمعرفة */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    <Button
                      variant={rating === "GOOD" ? "default" : "outline"}
                      size="sm"
                      onClick={() => rate(selected.id, pair.answer.id, "GOOD")}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      رد صحيح
                    </Button>
                    <Button
                      variant={
                        rating === "NEEDS_IMPROVEMENT" ? "destructive" : "outline"
                      }
                      size="sm"
                      onClick={() =>
                        rate(selected.id, pair.answer.id, "NEEDS_IMPROVEMENT")
                      }
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      يحتاج تحسين
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ms-auto text-primary"
                      disabled={added}
                      onClick={() => addToKnowledge(pair)}
                    >
                      {added ? (
                        <>
                          <Check className="h-4 w-4" />
                          تمت الإضافة
                        </>
                      ) : (
                        <>
                          <BookOpen className="h-4 w-4" />
                          إضافة إلى المعرفة
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
