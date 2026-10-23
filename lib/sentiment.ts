// تحليل نية الشراء والمزاج من نص الرسالة — قواعد لغوية بسيطة بلا تكلفة توكنات
// تُحدَّث عند كل رسالة واردة وتظهر كشارة على المحادثة لترتيب الأولويات
export type Sentiment = "INTERESTED" | "ANGRY" | "PRICE" | "NEUTRAL";
export type ConversationTopic = "INQUIRY" | "COMPLAINT" | "BOOKING" | "QUOTE";

export const CONVERSATION_TOPIC_LABELS: Record<ConversationTopic, string> = {
  INQUIRY: "استفسار",
  COMPLAINT: "شكوى",
  BOOKING: "حجز",
  QUOTE: "عرض سعر",
};

export const CONVERSATION_TOPICS = Object.keys(
  CONVERSATION_TOPIC_LABELS
) as ConversationTopic[];

export function isConversationTopic(value: string): value is ConversationTopic {
  return CONVERSATION_TOPICS.includes(value as ConversationTopic);
}

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  INTERESTED: "مهتم",
  ANGRY: "غاضب",
  PRICE: "سؤال سعر",
  NEUTRAL: "عام",
};

const ANGRY_WORDS = [
  "غالي", "مبالغ", "نصب", "احتيال", "سيء", "سييء", "رديء", "زبالة",
  "غاضب", "زعلان", "مشكلة", "خطأ", "غلط", "مشكله", "تاخير", "تأخير",
  "ما وصل", "ما وصلني", "ردوا", "ردو", "شكوى", "شكوي", "سوء", "فاشل",
  "بائس", "سيئ", "الأسوأ", "فشل", "ضايق", "منزعج",
];

const PRICE_WORDS = [
  "بكم", "كم سعر", "السعر", "اسعار", "أسعار", "سعره", "تكلفة", "تكلفه",
  "خصم", "خصومات", "عرض", "عروض", "كرامة", "كرامه", "دفع", "الدفع",
  "كاش", "فيزا", "تقسيط", "كم يكلف", "كم تكلف", "بلاش", "مجاني", "الأسعار",
];

const INTERESTED_WORDS = [
  "أريد", "اريد", "أبغى", "ابغى", "أطلب", "اطلب", "أشتري", "اشتري",
  "أشترى", "اشترى", "أحجز", "احجز", "حجز", "موعد", "توصيل", "أرسلوا",
  "ارسلوا", "أرسل", "ارسل", "تفاصيل", "متى يوصل", "متى توصلون", "متوفّر",
  "متوفر", "متوفرة", "متوفره", "كيف أطلب", "كيف اطلب", "نبي", "ابي",
  "للطلب",
];

const CRITICAL_WORDS = [
  "الغاء", "إلغاء", "الغاء الطلب", "الغاء الخدمة", "cancel", "cancellation",
  "قانون", "قانوني", "محامي", "محام", "محامٍ", "lawyer", "legal", "lawsuit",
  "اتصل بالشرطة", "شرطة", "سأقاضي", "ارفع قضية",
  "تهديد", "سأفضحكم", "احتيال", "نصاب", "سأشتكي",
  "غاضب جدا", "غاضب جداً", "وصلت لحدي", "لن اسكت", "لن أسكت",
  "furious", "angry", "report you", "scam",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
}

export function detectSentiment(text: string): Sentiment {
  const t = normalize(text);
  const has = (words: string[]) => words.some((w) => t.includes(w));
  // الغضب أولوية أعلى: يجب أن يراه الموظف فوراً مهما كان الموضوع
  if (has(ANGRY_WORDS)) return "ANGRY";
  if (has(INTERESTED_WORDS)) return "INTERESTED";
  if (has(PRICE_WORDS)) return "PRICE";
  return "NEUTRAL";
}

export function isCriticalMessage(text: string): boolean {
  const normalized = normalize(text);
  return CRITICAL_WORDS.some((word) => normalized.includes(normalize(word)));
}

const BOOKING_WORDS = [
  "احجز", "أحجز", "حجز", "احجزي", "موعد", "مواعيد", "احجزلي", "حجوزات",
  "reservation", "book appointment",
];

const QUOTE_WORDS = [
  "عرض سعر", "عروض اسعار", "عرض اسعار", "تسعيره", "تسعيرة", "تسعير",
  "كم سعر", "كم السعر", "بكم", "كم يكلف", "كم تكلف", "التكلفه",
  "التكلفة", "سعر", "اسعار", "أسعار", "price", "pricing", "quote",
];

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(normalize(word)));
}

export function detectConversationTopic(text: string): ConversationTopic {
  const normalized = normalize(text);
  if (detectSentiment(text) === "ANGRY") return "COMPLAINT";
  if (hasAny(normalized, BOOKING_WORDS)) return "BOOKING";
  if (detectSentiment(text) === "PRICE" || hasAny(normalized, QUOTE_WORDS)) {
    return "QUOTE";
  }
  return "INQUIRY";
}

// كشف لغة رسالة العميل ليُطلب من النموذج الرد بها — نطاقات أحرف فقط، بلا تكلفة
export type CustomerLanguage = "ar" | "en" | "other";

export const LANGUAGE_NAMES: Record<CustomerLanguage, string> = {
  ar: "العربية",
  en: "الإنجليزية",
  other: "غير العربية أو مختلطة",
};

export function detectLanguage(text: string): CustomerLanguage {
  const letters = text.replace(/[\s\p{P}\p{N}]/gu, "");
  if (!letters) return "ar";
  const arabic = (letters.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (letters.match(/[a-zA-Z]/g) ?? []).length;
  if (arabic >= latin) return "ar";
  if (latin / letters.length > 0.6) return "en";
  return "other";
}
