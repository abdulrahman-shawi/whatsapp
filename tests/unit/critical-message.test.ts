import { describe, expect, it } from "vitest";
import { isCriticalMessage } from "../../lib/sentiment";

describe("isCriticalMessage", () => {
  it.each([
    "أريد إلغاء الخدمة",
    "سأرفع قضية وأتحدث مع محامي",
    "I am furious and will report you",
    "هذا احتيال وسأشتكي",
  ])("detects critical language: %s", (text) => {
    expect(isCriticalMessage(text)).toBe(true);
  });

  it.each([
    "أريد معرفة الأسعار",
    "شكراً على المساعدة",
    "Can you tell me your opening hours?",
  ])("does not escalate routine language: %s", (text) => {
    expect(isCriticalMessage(text)).toBe(false);
  });
});
