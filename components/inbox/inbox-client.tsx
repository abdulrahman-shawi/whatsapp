"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { getPusherInstance, initPusherClient, type Channel } from "@/lib/pusher-client";
import { ConversationList } from "./conversation-list";
import { ChatWindow } from "./chat-window";
import { ContactPanel } from "./contact-panel";
import type {
  AssignmentFilter,
  ContactInfo,
  ConversationListItem,
  MemberInfo,
  MessageItem,
} from "./types";

// نمط عرض القائمة: الوارد المفتوح / المؤرشفة / المغلقة
export type ListView = "open" | "archived" | "closed";

type Props = {
  initialConversations: ConversationListItem[];
  members: MemberInfo[];
  currentUserId: string;
};

// العميل الرئيسي لصندوق الوارد: يدير الحالة والاستطلاع الدوري
export function InboxClient({
  initialConversations,
  members,
  currentUserId,
}: Props) {
  const [conversations, setConversations] =
    useState<ConversationListItem[]>(initialConversations);
  const [view, setView] = useState<ListView>("open");
  const [filter, setFilter] = useState<AssignmentFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // مرجع لآخر توقيت رسالة لاستطلاع الرسائل الجديدة فقط
  const lastTsRef = useRef<string | null>(null);
  // مرجع للمحادثة المفتوحة حالياً — تستخدمه معالجات Pusher
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  // مراجع لحالة العرض والفلتر — تستخدمها معالجات Pusher والاستطلاع
  const viewRef = useRef(view);
  viewRef.current = view;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // تحديث قائمة المحادثات من الخادم حسب نمط العرض والفلتر الحاليين
  const refreshList = useCallback(async () => {
    try {
      const archived = viewRef.current === "archived";
      const closed = viewRef.current === "closed";
      const res = await fetch(
        `/api/conversations?archived=${archived}&closed=${closed}&filter=${filterRef.current}`
      );
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch {
      // تجاهل أخطاء الشبكة في الاستطلاع الدوري
    }
  }, []);

  // استطلاع قائمة المحادثات كل 15 ثانية
  // (يبقى كاحتياط حتى مع Pusher، وهو الطريقة الوحيدة عند غياب إعداداته)
  useEffect(() => {
    refreshList();
    const t = setInterval(refreshList, 15000);
    return () => clearInterval(t);
  }, [view, filter, refreshList]);

  // اشتراك Pusher الفوري في قناة مساحة العمل — تُجلب المفاتيح من الخادم
  // (قاعدة البيانات أو .env)، وعند غيابها نعتمد على الاستطلاع أعلاه
  const workspaceId = conversations[0]?.workspaceId;
  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;
    let channel: Channel | null = null;
    const channelName = `private-workspace-${workspaceId}`;

    initPusherClient().then((pusher) => {
      if (!pusher || cancelled) return;
      channel = pusher.subscribe(channelName);

      // رسالة جديدة: نُلحقها إن كانت للمحادثة المفتوحة (مع منع التكرار)
      channel.bind(
        "new-message",
        (data: { conversationId: string; message: MessageItem }) => {
          if (data.conversationId === selectedIdRef.current) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.message.id)) return prev;
              lastTsRef.current = data.message.createdAt;
              return [...prev, data.message];
            });
          }
          refreshList();
        }
      );

      // تحديث قائمة المحادثات (آخر رسالة / عدد غير المقروء / إسناد / إغلاق)
      channel.bind("conversation-updated", () => {
        refreshList();
      });
    });

    return () => {
      cancelled = true;
      if (channel) {
        channel.unbind_all();
        getPusherInstance()?.unsubscribe(channelName);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, refreshList]);

  // تحميل رسائل المحادثة المحددة + استطلاع الجديد كل 5 ثوانٍ
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      lastTsRef.current = null;
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);

    fetch(`/api/conversations/${selectedId}/messages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setMessages(data.messages);
        lastTsRef.current =
          data.messages.length > 0
            ? data.messages[data.messages.length - 1].createdAt
            : null;
        // الفتح علّم الرسائل كمقروءة — حدّث القائمة لإزالة شارة العدد
        refreshList();
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    const t = setInterval(async () => {
      if (cancelled) return;
      const since = lastTsRef.current;
      const url =
        `/api/conversations/${selectedId}/messages` +
        (since ? `?since=${encodeURIComponent(since)}` : "");
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data.messages.length > 0) {
          lastTsRef.current =
            data.messages[data.messages.length - 1].createdAt;
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            return [
              ...prev,
              ...data.messages.filter((m: MessageItem) => !ids.has(m.id)),
            ];
          });
        }
      } catch {
        // تجاهل أخطاء الشبكة في الاستطلاع
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId, refreshList]);

  // تبديل الحالة بين الرد الآلي والتحكم اليدوي
  async function handleToggleStatus() {
    if (!selected) return;
    const next = selected.status === "MANUAL" ? "AI" : "MANUAL";
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    refreshList();
  }

  // أرشفة / إلغاء أرشفة المحادثة الحالية
  async function handleToggleArchive() {
    if (!selected) return;
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: !selected.isArchived }),
    });
    setSelectedId(null);
    setMessages([]);
    refreshList();
  }

  // إسناد المحادثة لعضو في الفريق أو إلغاء إسنادها (null)
  async function handleAssign(userId: string | null) {
    if (!selected) return;
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToId: userId }),
    });
    refreshList();
  }

  // إغلاق المحادثة المنتهية وإخفاءها من الوارد — رسالة العميل تعيد فتحها
  async function handleToggleClosed() {
    if (!selected) return;
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closed: !selected.closedAt }),
    });
    // عند عرض قائمة المغلقة تختفي المحادثة منها بعد الإغلاق/الفتح
    if (view === "closed") {
      setSelectedId(null);
      setMessages([]);
    }
    refreshList();
  }

  // إرسال رسالة (أو ملاحظة داخلية isNote) وإضافتها فوراً للواجهة
  async function handleSend(body: string, isNote: boolean) {
    if (!selected) return;
    const res = await fetch(`/api/conversations/${selected.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, isNote }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      lastTsRef.current = data.message.createdAt;
      refreshList();
    }
  }

  // إرسال وسائط (ملف فعلي) مع تسمية توضيحية اختيارية
  async function handleSendMedia(file: File, caption: string) {
    if (!selected) return;
    const form = new FormData();
    form.append("file", file);
    if (caption) form.append("caption", caption);
    const res = await fetch(`/api/conversations/${selected.id}/media`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      lastTsRef.current = data.message.createdAt;
      refreshList();
    }
  }

  // إرسال قالب معتمد في ميتا بقيم المتغيرات
  async function handleSendTemplate(templateId: string, params: string[]) {
    if (!selected) return;
    const res = await fetch(`/api/conversations/${selected.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: { id: templateId, params } }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      lastTsRef.current = data.message.createdAt;
      refreshList();
    }
  }

  // حفظ تعديلات جهة الاتصال وتحديث الحالة المحلية
  async function handleUpdateContact(
    patch: Partial<Pick<ContactInfo, "name" | "tags" | "notes">>
  ) {
    if (!selected) return;
    const res = await fetch(`/api/contacts/${selected.contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selected.id ? { ...c, contact: data.contact } : c
        )
      );
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden rounded-xl border bg-card">
      {/* قائمة المحادثات — تظهر يميناً في RTL */}
      <div className="w-80 shrink-0 border-e">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          view={view}
          onViewChange={(v) => {
            setView(v);
            setSelectedId(null);
            setMessages([]);
          }}
          filter={filter}
          onFilterChange={setFilter}
        />
      </div>

      {/* نافذة المحادثة */}
      <div className="min-w-0 flex-1">
        {selected ? (
          <ChatWindow
            conversation={selected}
            messages={messages}
            loading={loadingMessages}
            members={members}
            currentUserId={currentUserId}
            onSend={handleSend}
            onSendMedia={handleSendMedia}
            onSendTemplate={handleSendTemplate}
            onToggleStatus={handleToggleStatus}
            onToggleArchive={handleToggleArchive}
            onAssign={handleAssign}
            onToggleClosed={handleToggleClosed}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessagesSquare className="h-10 w-10" />
            <p>اختر محادثة لعرضها</p>
          </div>
        )}
      </div>

      {/* لوحة جهة الاتصال — تظهر يساراً في RTL */}
      {selected && (
        <div className="w-72 shrink-0 border-s">
          <ContactPanel
            contact={selected.contact}
            onSave={handleUpdateContact}
          />
        </div>
      )}
    </div>
  );
}
