// الأنواع المشتركة لمكونات صندوق الوارد (بيانات مُسلسلة من الخادم)

export type ContactInfo = {
  id: string;
  name: string | null;
  waPhone: string;
  tags: string[];
  notes: string | null;
  stage: string; // مرحلة العميل في مسار البيع — انظر lib/contact-stages.ts
};

export type MemberInfo = {
  id: string;
  name: string;
};

export type ConversationStatus = "AI" | "MANUAL" | "HANDED_OFF";
export type Platform = "WHATSAPP" | "WIDGET" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM";
export type AssignmentFilter = "all" | "mine" | "unassigned";

export type ConversationListItem = {
  id: string;
  workspaceId: string;
  status: ConversationStatus;
  platform: Platform;
  isArchived: boolean;
  agentId: string | null;
  // الموظفون المسند إليهم المحادثة (قد يكون أكثر من واحد)
  assignees: MemberInfo[];
  closedAt: string | null;
  // موعد المتابعة القادم لهذه المحادثة (إن وُجد)
  followUpAt: string | null;
  // وسوم وملاحظات على مستوى المحادثة (مستقلة عن جهة الاتصال)
  tags: string[];
  notes: string | null;
  // تقييم رضا العميل عن المحادثة (١-٥) إن قيّم
  csatRating: number | null;
  // مزاج/نية العميل: INTERESTED | ANGRY | PRICE | NEUTRAL
  sentiment: string | null;
  // ملخص المحادثة المولّد بالذكاء الاصطناعي (إن وُجد)
  summary: string | null;
  lastMessageAt: string;
  contact: ContactInfo;
  lastMessage: {
    body: string;
    direction: "INBOUND" | "OUTBOUND";
    createdAt: string;
  } | null;
  unreadCount: number;
};

export type MessageItem = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  senderType: "AI" | "HUMAN" | "CUSTOMER";
  isNote: boolean;
  senderName: string | null;
  isRead: boolean;
  // وسائط واتساب (مزود ميتا) — تعرض عبر /api/media?id=...
  mediaId: string | null;
  mediaMime: string | null;
  mediaType: string | null;
  // تقييم الموظف لرد الذكاء الاصطناعي: GOOD أو NEEDS_IMPROVEMENT (تدريب الوكيل)
  rating: string | null;
  createdAt: string;
};

export type TemplateInfo = {
  id: string;
  name: string;
  language: string;
  body: string;
};

// رد جاهز: اختصار يردّ به الموظف فيُستبدل بالنص الكامل
export type CannedResponse = {
  id: string;
  shortcut: string;
  body: string;
};

// رسالة مجدولة بانتظار الإرسال في محادثة
export type ScheduledMessage = {
  id: string;
  body: string;
  sendAt: string;
  attempts: number;
  lastError: string | null;
};
