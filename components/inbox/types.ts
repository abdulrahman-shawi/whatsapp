// الأنواع المشتركة لمكونات صندوق الوارد (بيانات مُسلسلة من الخادم)

export type ContactInfo = {
  id: string;
  name: string | null;
  waPhone: string;
  tags: string[];
  notes: string | null;
};

export type ConversationStatus = "AI" | "MANUAL" | "HANDED_OFF";
export type Platform = "WHATSAPP" | "WIDGET";

export type ConversationListItem = {
  id: string;
  workspaceId: string;
  status: ConversationStatus;
  platform: Platform;
  isArchived: boolean;
  agentId: string | null;
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
  isRead: boolean;
  createdAt: string;
};
