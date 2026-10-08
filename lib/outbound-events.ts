// أجزاء آمنة للعميل والخادم معاً — بلا استيرادات node

// كتالوج أحداث الويب هوك الصادر — مجموعات حسب الفئة للعرض في واجهة الاختيار
export const OUTBOUND_EVENT_GROUPS: {
  category: string;
  events: { key: string; label: string; description: string }[];
}[] = [
  {
    category: "الرسائل",
    events: [
      { key: "message.created", label: "رسالة جديدة", description: "رسالة جديدة — واردة أو صادرة" },
      { key: "message.updated", label: "تحديث الرسالة", description: "تعليم مقروء/تقييم" },
    ],
  },
  {
    category: "جهات الاتصال",
    events: [
      { key: "contact.created", label: "عميل جديد", description: "إنشاء جهة اتصال جديدة" },
      { key: "contact.updated", label: "تحديث العميل", description: "تعديل بيانات جهة اتصال" },
      { key: "contact.deleted", label: "حذف العميل", description: "حذف جهة اتصال نهائياً" },
    ],
  },
  {
    category: "المحادثات",
    events: [
      { key: "conversation.assigned", label: "إسناد المحادثة", description: "إسناد المحادثة لموظفين" },
      { key: "conversation.closed", label: "إغلاق المحادثة", description: "إغلاق المحادثة" },
      { key: "conversation.reopened", label: "إعادة الفتح", description: "إعادة فتح محادثة مغلقة" },
    ],
  },
  {
    category: "الحملات",
    events: [
      { key: "broadcast.completed", label: "اكتمال الحملة", description: "الحملة أُرسلت بالكامل أو جزئياً" },
      { key: "broadcast.failed", label: "فشل الحملة", description: "فشل إرسال الحملة" },
    ],
  },
  {
    category: "الحجوزات",
    events: [
      { key: "booking.created", label: "حجز جديد", description: "إنشاء حجز موعد" },
      { key: "booking.deleted", label: "حذف الحجز", description: "حذف حجز نهائياً" },
    ],
  },
  {
    category: "القوالب",
    events: [
      { key: "template.created", label: "قالب جديد", description: "إضافة قالب رسائل" },
      { key: "template.deleted", label: "حذف القالب", description: "حذف قالب رسائل" },
    ],
  },
];

// كل مفاتيح الأحداث المعروفة — للتحقق عند الإنشاء/التحرير
export const OUTBOUND_EVENT_KEYS: string[] = OUTBOUND_EVENT_GROUPS.flatMap((g) =>
  g.events.map((e) => e.key)
);

// التحقق من مدخلات إنشاء/تحرير ويب هوك صادر
// يعيد البيانات المُتحقَّق منها أو رسالة خطأ عربية
export function validateOutboundWebhookInput(body: unknown): {
  data?: { name: string; url: string; events: string[]; secret: string | null };
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { error: "طلب غير صالح" };
  }
  const b = body as Record<string, unknown>;

  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) {
    return { error: "الرابط يجب أن يبدأ بـ http:// أو https://" };
  }
  if (url.length > 500) {
    return { error: "الرابط حتى ٥٠٠ حرف" };
  }

  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  const events = Array.isArray(b.events)
    ? [...new Set(b.events.filter((e): e is string => typeof e === "string"))]
    : [];
  if (events.length === 0) {
    return { error: "اختر حدثاً واحداً على الأقل" };
  }
  if (events.some((e) => !OUTBOUND_EVENT_KEYS.includes(e))) {
    return { error: "أحد الأحداث المختارة غير معروف" };
  }

  let secret: string | null = null;
  if (b.secret !== undefined && b.secret !== null && b.secret !== "") {
    if (typeof b.secret !== "string" || b.secret.length > 128) {
      return { error: "السر حتى ١٢٨ حرفاً" };
    }
    secret = b.secret;
  }

  return { data: { name, url, events, secret } };
}
