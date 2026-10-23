"use client";

import { useEffect, useRef } from "react";
import { Archive, BellRing, CalendarClock, CheckCheck, Inbox as InboxIcon, Search, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime, dateTime } from "@/lib/time";
import { StageBadge } from "./stage-badge";
import { CONVERSATION_TOPIC_LABELS } from "@/lib/sentiment";
import type { ListView } from "./inbox-client";
import type {
  AssignmentFilter,
  ConversationListItem,
  ConversationStatus,
  ConversationTopic,
} from "./types";

// مسميات وألوان حالات المحادثة
const statusConfig: Record<
  ConversationStatus,
  { label: string; variant: "default" | "warning" | "secondary" }
> = {
  AI: { label: "آلي", variant: "default" },
  MANUAL: { label: "يدوي", variant: "warning" },
  HANDED_OFF: { label: "مسلّم", variant: "secondary" },
};

const viewTitles: Record<ListView, string> = {
  open: "المحادثات",
  followups: "متابعات",
  archived: "المحادثات المؤرشفة",
  closed: "المحادثات المغلقة",
};

// مسميات وألوان مزاج/نية العميل — تُحدَّث تلقائياً عند كل رسالة واردة
const sentimentConfig: Record<string, { label: string; className: string }> = {
  INTERESTED: { label: "مهتم", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  ANGRY: { label: "غاضب", className: "border-red-300 bg-red-50 text-red-700" },
  PRICE: { label: "سؤال سعر", className: "border-sky-300 bg-sky-50 text-sky-700" },
};

const topicConfig: Record<ConversationTopic, string> = {
  INQUIRY: "border-slate-300 bg-slate-50 text-slate-700",
  COMPLAINT: "border-red-300 bg-red-50 text-red-700",
  BOOKING: "border-violet-300 bg-violet-50 text-violet-700",
  QUOTE: "border-sky-300 bg-sky-50 text-sky-700",
};

type Props = {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  view: ListView;
  onViewChange: (view: ListView) => void;
  filter: AssignmentFilter;
  onFilterChange: (filter: AssignmentFilter) => void;
  topic: ConversationTopic | "all";
  onTopicChange: (topic: ConversationTopic | "all") => void;
  // البحث الشامل: نص البحث ونتائجه تديرها النافذة الأم (inbox-client)
  query: string;
  onQueryChange: (q: string) => void;
  searching: boolean;
};

// قائمة المحادثات (العمود الأيمن في RTL)
export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  view,
  onViewChange,
  filter,
  onFilterChange,
  topic,
  onTopicChange,
  query,
  onQueryChange,
  searching,
}: Props) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K (أو Cmd+K) في أي مكان بالصفحة ينقل التركيز لحقل البحث
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 p-3">
        <h2 className="font-extrabold">{viewTitles[view]}</h2>
        <div className="flex items-center gap-1">
          {view !== "followups" && (
            <Button
              variant="ghost"
              size="sm"
              title="محادثات لها موعد متابعة"
              onClick={() => onViewChange("followups")}
            >
              <BellRing className="h-4 w-4" />
            </Button>
          )}
          {view !== "archived" && (
            <Button
              variant="ghost"
              size="sm"
              title="المحادثات المؤرشفة"
              onClick={() => onViewChange("archived")}
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
          {view !== "closed" && (
            <Button
              variant="ghost"
              size="sm"
              title="المحادثات المغلقة"
              onClick={() => onViewChange("closed")}
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
          )}
          {view !== "open" && (
            <Button variant="ghost" size="sm" onClick={() => onViewChange("open")}>
              <InboxIcon className="h-4 w-4" />
              الوارد
            </Button>
          )}
        </div>
      </div>

      {/* البحث الشامل: اسم العميل أو الرقم أو الوسوم أو نص الرسائل */}
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="بحث في المحادثات والرسائل… (Ctrl+K)"
            className="w-full rounded-full border border-border bg-background py-2 ps-9 pe-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => onQueryChange("")}
              title="مسح البحث"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* فلتر الإسناد — في الوارد المفتوح فقط */}
      {view === "open" && (
        <div className="space-y-2 border-b p-2">
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as AssignmentFilter)}
            className="w-full rounded-full border border-border bg-background px-3.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">الكل</option>
            <option value="mine">محادثاتي</option>
            <option value="unassigned">غير مسندة</option>
          </select>
          <select
            aria-label="تصفية حسب موضوع المحادثة"
            value={topic}
            onChange={(e) =>
              onTopicChange(e.target.value as ConversationTopic | "all")
            }
            className="w-full rounded-full border border-border bg-background px-3.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">كل المواضيع</option>
            {Object.entries(CONVERSATION_TOPIC_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {query.trim().length >= 2 && conversations.length === 0 && !searching ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            لا نتائج مطابقة لبحثك
          </p>
        ) : conversations.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {view === "followups"
              ? "لا توجد محادثات بموعد متابعة"
              : "لا توجد محادثات بعد"}
          </p>
        ) : (
          conversations.map((c) => {
            const status = statusConfig[c.status];
            const displayName = c.contact.name ?? c.contact.waPhone;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full min-h-14 flex-col gap-1 rounded-2xl p-3 text-start transition-colors hover:bg-muted/60",
                  selectedId === c.id && "bg-accent"
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-bold">
                    {/* أفاتار بالحرف الأول بلون ثابت مشتق من الاسم */}
                    <span
                      className="grid size-9 shrink-0 select-none place-items-center rounded-full text-xs font-black text-white"
                      style={{
                        backgroundColor:
                          ["#06D6A0", "#4D65FF", "#F5A623", "#EA4C3C", "#8B5CF6", "#0EA5E9"][
                            Math.abs(
                              [...displayName].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7)
                            ) % 6
                          ],
                      }}
                    >
                      {displayName.trim()[0] ?? "؟"}
                    </span>
                    <span className="truncate">{displayName}</span>
                    <span className="shrink-0 rounded-full border px-1.5 py-0.5">
                      <StageBadge stage={c.contact.stage} />
                    </span>
                  </span>
                  <span className="font-num shrink-0 text-[10.5px] text-muted-foreground">
                    {relativeTime(c.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {c.lastMessage
                      ? `${c.lastMessage.direction === "OUTBOUND" ? "أنت: " : ""}${c.lastMessage.body}`
                      : "لا توجد رسائل"}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="font-num flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {c.sentiment && sentimentConfig[c.sentiment] && (
                    <Badge
                      variant="outline"
                      className={`px-1.5 py-0 ${sentimentConfig[c.sentiment].className}`}
                      title="نية الشراء والمزاج — يُحدَّث تلقائياً من آخر رسالة"
                    >
                      {sentimentConfig[c.sentiment].label}
                    </Badge>
                  )}
                  {c.topic && (
                    <Badge
                      variant="outline"
                      className={`px-1.5 py-0 ${topicConfig[c.topic]}`}
                      title="الموضوع المصنّف من أحدث رسالة واردة"
                    >
                      {CONVERSATION_TOPIC_LABELS[c.topic]}
                    </Badge>
                  )}
                  {c.isCritical && (
                    <Badge
                      variant="outline"
                      className="border-red-400 px-1.5 py-0 text-red-700"
                      title="محادثة حرجة — مُثبتة ومسندة للمالك"
                    >
                      <span aria-hidden="true">!</span>
                      حرجة
                    </Badge>
                  )}
                  {c.platform === "WIDGET" && (
                    <Badge variant="outline">من الموقع</Badge>
                  )}
                  {c.platform === "TELEGRAM" && (
                    <Badge variant="outline">تيليجرام</Badge>
                  )}
                  {c.platform === "MESSENGER" && (
                    <Badge variant="outline">ماسنجر</Badge>
                  )}
                  {c.platform === "INSTAGRAM" && (
                    <Badge variant="outline">انستغرام</Badge>
                  )}
                  {c.followUpAt && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-300 text-amber-700"
                      title={`متابعة: ${dateTime(c.followUpAt)}`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {dateTime(c.followUpAt)}
                    </Badge>
                  )}
                  {view === "followups" && c.followUpAt && (
                    <span className="text-xs text-amber-700">
                      متابعة {dateTime(c.followUpAt)}
                    </span>
                  )}
                  {c.assignees.length > 0 && (
                    <span className="flex items-center gap-1" title={c.assignees.map((a) => a.name).join("، ")}>
                      <UserRound className="h-3 w-3 shrink-0 text-muted-foreground" />
                      {c.assignees.map((a) => (
                        <Badge key={a.id} variant="outline">
                          {a.name}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
