import { describe, expect, it } from "vitest";
import { detectConversationTopic } from "@/lib/sentiment";

describe("conversation topic classification", () => {
  it("classifies complaints with priority over commercial topics", () => {
    expect(detectConversationTopic("مشكلة في الطلب، كم سعر الاستبدال؟")).toBe(
      "COMPLAINT"
    );
  });

  it("classifies appointment requests as bookings", () => {
    expect(detectConversationTopic("أريد حجز موعد غداً")).toBe("BOOKING");
  });

  it("classifies price and quote questions", () => {
    expect(detectConversationTopic("أريد عرض سعر للخدمة")).toBe("QUOTE");
    expect(detectConversationTopic("كم سعر المنتج؟")).toBe("QUOTE");
  });

  it("uses inquiry as the default topic", () => {
    expect(detectConversationTopic("السلام عليكم، أريد معرفة التفاصيل")).toBe(
      "INQUIRY"
    );
  });
});
