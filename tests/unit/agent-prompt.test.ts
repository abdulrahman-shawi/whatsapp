import { describe, expect, it } from "vitest";
import {
  buildAgentSystemPrompt,
  parseInstructionBlocks,
  parseSkills,
  parseSkillPrompts,
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
  it("assembles base, instruction sections and per-skill sections", () => {
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
    // كل مهارة قسم مستقل باسمها
    expect(prompt).toContain("## تحديث بيانات العميل");
    expect(prompt).toContain("## تحديث مرحلة العميل");
    expect(prompt).toContain("حدّث بيانات جهة الاتصال");
    expect(prompt).toContain("حدّث مرحلته");
    expect(prompt).not.toContain("update_contact");
  });

  it("uses custom skill prompt text when provided", () => {
    const prompt = buildAgentSystemPrompt({
      systemPrompt: "أساس",
      skills: ["add_note"],
      skillPrompts: { add_note: "سجّل ملاحظة عند كل طلب خاص بالشحن." },
    });
    expect(prompt).toContain("## إضافة تعليقات\nسجّل ملاحظة عند كل طلب خاص بالشحن.");
    expect(prompt).not.toContain("تستحق التوثيق");
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

describe("parseSkillPrompts", () => {
  it("keeps non-empty texts for known skills only", () => {
    expect(
      parseSkillPrompts({
        add_note: "  نص مخصص  ",
        update_stage: "",
        unknown_skill: "نص",
        update_contact: 5,
      })
    ).toEqual({ add_note: "نص مخصص" });
  });

  it("returns empty for non-object values", () => {
    expect(parseSkillPrompts(null)).toEqual({});
    expect(parseSkillPrompts(["a"])).toEqual({});
    expect(parseSkillPrompts("نص")).toEqual({});
  });
});
