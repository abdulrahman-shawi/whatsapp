// مراحل العميل في مسار البيع: المسميات العربية والألوان المعروضة
// تُستخدم في لوحة جهة الاتصال وشارات قائمة المحادثات

export const CONTACT_STAGES = [
  { value: "NEW", label: "عملية بيع جديدة", color: "#3b82f6" }, // أزرق
  { value: "CONTACTING", label: "جاري التواصل", color: "#a855f7" }, // بنفسجي
  { value: "INTERESTED", label: "مهتم", color: "#f59e0b" }, // برتقالي
  { value: "NEGOTIATING", label: "مقفل للتراسل", color: "#404040" }, // أسود
  { value: "CUSTOMER", label: "عميل مشترٍ", color: "#22c55e" }, // أخضر
  { value: "LOST", label: "ضائع", color: "#ef4444" }, // أحمر
] as const;

export type ContactStageValue = (typeof CONTACT_STAGES)[number]["value"];

export function isContactStage(value: unknown): value is ContactStageValue {
  return (
    typeof value === "string" &&
    CONTACT_STAGES.some((s) => s.value === value)
  );
}

export function stageConfig(value: string) {
  return (
    CONTACT_STAGES.find((s) => s.value === value) ?? {
      value: "NEW" as const,
      label: "عملية بيع جديدة",
      color: "#3b82f6",
    }
  );
}
