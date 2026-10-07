// تحليل نية الشراء والمزاج من نص الرسالة — قواعد لغوية بسيطة بلا تكلفة توكنات
// تُحدَّث عند كل رسالة واردة وتظهر كشارة على المحادثة لترتيب الأولويات
export type Sentiment = "INTERESTED" | "ANGRY" | "PRICE" | "NEUTRAL";

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
