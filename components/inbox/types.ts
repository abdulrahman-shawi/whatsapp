// الأنواع المشتركة لمكونات صندوق الوارد (بيانات مُسلسلة من الخادم)

export type ContactInfo = {
  id: string;
  name: string | null;
  waPhone: string;
  tags: string[];
  notes: string | null;
};

export type MemberInfo = {
  id: string;
  name: string;
};

export type ConversationStatus = "AI" | "MANUAL" | "HANDED_OFF";
export type Platform = "WHATSAPP" | "WIDGET";
export type AssignmentFilter = "all" | "mine" | "unassigned";

export type ConversationListItem = {
  id: string;
  workspaceId: string;
  status: ConversationStatus;
  platform: Platform;
  isArchived: boolean;
  agentId: string | null;
  assignedTo: MemberInfo | null;
  closedAt: string | null;
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
  createdAt: string;
};

export type TemplateInfo = {
  id: string;
  name: string;
  language: string;
  body: string;
};
