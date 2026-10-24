import { describe, expect, it } from "vitest";
import type { KnowledgeSource } from "@prisma/client";
import { retrieveRelevantKnowledge } from "@/lib/retrieval";

function source(partial: Partial<KnowledgeSource> & { title: string; content: string }): KnowledgeSource {
  return {
    id: "s1",
    agentId: "a1",
    type: "TEXT",
    fileUrl: null,
    url: null,
    lastSyncedAt: null,
    dbEngine: null,
    dbHost: null,
    dbPort: null,
    dbName: null,
    dbUser: null,
    dbPassword: null,
    dbQuery: null,
    createdAt: new Date(),
    ...partial,
  } as KnowledgeSource;
}

describe("retrieveRelevantKnowledge", () => {
  it("returns small sources with their titles", () => {
    const sources = [
      source({ title: "الأسعار", content: "اشتراك شهري ٩٩ ريال" }),
      source({ title: "الدوام", content: "نعمل من ٩ صباحاً حتى ٥ مساءً" }),
    ];
    const result = retrieveRelevantKnowledge(sources, "كم السعر؟", 3);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("الأسعار");
    expect(result[0]).toContain("٩٩ ريال");
  });

  it("ranks the chunk containing the query terms first", () => {
    // مصدر طويل متعدد الأسطر: مقاطع عن الشحن ثم مقاطع عن الاسترجاع
    const shipping = Array.from(
      { length: 80 },
      (_, i) => `الشحن والتوصيل: نغطي جميع المدن، الشحنة رقم ${i}`
    ).join("\n");
    const returns = Array.from(
      { length: 80 },
      (_, i) => `سياسة الاسترجاع: يمكنك إرجاع أي منتج، الطلب ${i}`
    ).join("\n");
    const sources = [source({ title: "الأسئلة الشائعة", content: `${shipping}\n${returns}` })];

    const result = retrieveRelevantKnowledge(sources, "ما هي سياسة الاسترجاع عندكم؟", 1);
    expect(result).toHaveLength(1);
    // لو لم يُقيَّم تقاطع الكلمات لكان المقطع الأول (شحن خالص) هو الراجِع
    expect(result[0]).toContain("الاسترجاع");
  });

  it("splits long sources into title-prefixed chunks", () => {
    const long = "كلمة متكررة ".repeat(300); // ~3900 حرف → 4 مقاطع تقريباً
    const sources = [source({ title: "دليل", content: long })];

    const result = retrieveRelevantKnowledge(sources, "كلمة", 10);
    expect(result.length).toBeGreaterThan(2);
    for (const chunk of result) {
      expect(chunk.startsWith("دليل")).toBe(true);
    }
  });

  it("returns at most `top` chunks", () => {
    const sources = [
      source({ title: "أ", content: "قهوة مختصة محمصة" }),
      source({ title: "ب", content: "شاي أخضر" }),
      source({ title: "ج", content: "عصير طبيعي" }),
      source({ title: "د", content: "ماء معدني" }),
      source({ title: "هـ", content: "قهوة عربية" }),
    ];
    const result = retrieveRelevantKnowledge(sources, "قهوة", 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("returns empty for no sources", () => {
    expect(retrieveRelevantKnowledge([], "أي شيء")).toEqual([]);
  });
});
