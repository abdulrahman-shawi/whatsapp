"use client";

import { Archive, CheckCheck, Inbox as InboxIcon, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/time";
import type { ListView } from "./inbox-client";
import type {
  AssignmentFilter,
  ConversationListItem,
  ConversationStatus,
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
  archived: "المحادثات المؤرشفة",
  closed: "المحادثات المغلقة",
};

type Props = {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  view: ListView;
  onViewChange: (view: ListView) => void;
  filter: AssignmentFilter;
  onFilterChange: (filter: AssignmentFilter) => void;
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
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="font-semibold">{viewTitles[view]}</h2>
        <div className="flex items-center gap-1">
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

      {/* فلتر الإسناد — في الوارد المفتوح فقط */}
      {view === "open" && (
        <div className="border-b p-2">
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as AssignmentFilter)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="all">الكل</option>
            <option value="mine">محادثاتي</option>
            <option value="unassigned">غير مسندة</option>
          </select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            لا توجد محادثات بعد
          </p>
        ) : (
          conversations.map((c) => {
            const status = statusConfig[c.status];
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full flex-col gap-1 border-b p-3 text-start transition-colors hover:bg-muted/50",
                  selectedId === c.id && "bg-accent"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {c.contact.name ?? c.contact.waPhone}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(c.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-muted-foreground">
                    {c.lastMessage
                      ? `${c.lastMessage.direction === "OUTBOUND" ? "أنت: " : ""}${c.lastMessage.body}`
                      : "لا توجد رسائل"}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {c.platform === "WIDGET" && (
                    <Badge variant="outline">من الموقع</Badge>
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
