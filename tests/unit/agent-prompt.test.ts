import { describe, expect, it } from "vitest";
import {
  buildAgentSystemPrompt,
  parseInstructionBlocks,
  parseSkills,
} from "@/lib/agent-prompt";

describe("parseInstructionBlocks", () => {
  it("keeps valid blocks and drops malformed ones", () => {
    const raw = [
      { id: "a", title: "التعامل مع الشكاوى", content: "هدّئ العميل ثم اعتذر" },
      { title: "بلا معرف", content: "محتوى" },
      { id: "b", title: " ", content: "عنوان فارغ يُستبعد" },
      { id: "c", content: "بلا عنوان" },
      "نص عشوائي",
    ];
    const blocks = parseInstructionBlocks(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      id: "a",
      title: "التعامل مع الشكاوى",
      content: "هدّئ العميل ثم اعتذر",
    });
    expect(blocks[1].id).toBe("block-1");
  });

  it("returns empty for non-array values", () => {
    expect(parseInstructionBlocks(null)).toEqual([]);
    expect(parseInstructionBlocks("نص")).toEqual([]);
    expect(parseInstructionBlocks({})).toEqual([]);
  });
});

describe("parseSkills", () => {
  it("keeps only known skill keys", () => {
    expect(parseSkills(["update_contact", "unknown_key", 5, "add_note"])).toEqual([
      "update_contact",
      "add_note",
    ]);
  });

  it("returns empty for non-array values", () => {
    expect(parseSkills(undefined)).toEqual([]);
    expect(parseSkills("update_contact")).toEqual([]);
  });
});

describe("buildAgentSystemPrompt", () => {
  it("assembles base, instruction sections and skill behaviors", () => {
    const prompt = buildAgentSystemPrompt({
      systemPrompt: "أنت مساعد متجر مهذب.",
      instructions: [
        { id: "x", title: "الشكاوى", content: "إذا اشتكى العميل: اعتذر وصعّد للمدير." },
        { id: "y", title: "الأسعار", content: "اقتبس الأسعار من قائمة المعرفة فقط." },
      ],
      skills: ["update_stage", "update_contact"],
    });

    expect(prompt).toContain("أنت مساعد متجر مهذب.");
    expect(prompt).toContain("## الشكاوى\nإذا اشتكى العميل: اعتذر وصعّد للمدير.");
    expect(prompt).toContain("## الأسعار");
    expect(prompt).toContain("## مهاراتك أثناء المحادثة");
    expect(prompt.indexOf("update_contact")).toBe(-1);
    expect(prompt).toContain("حدّث بيانات جهة الاتصال");
    expect(prompt).toContain("حدّث مرحلته");
  });

  it("omits sections when empty and ignores unknown skills", () => {
    const prompt = buildAgentSystemPrompt({
      systemPrompt: "أساس فقط",
      instructions: [],
      skills: ["not_a_skill"],
    });
    expect(prompt).toBe("أساس فقط");
    expect(prompt).not.toContain("##");
  });
});
