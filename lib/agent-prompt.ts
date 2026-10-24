import { AGENT_SKILLS } from "@/lib/agent-skills";

// بناء برومبت النظام الكامل للوكيل من حقوله المخزنة:
// تعليمات أساسية + أقسام التعليمات + سلوكيات المهارات المفعّلة.
// يستخدمه محرك الرسائل ومسار الاختبار معاً حتى تطابق التجربة السلوك الفعلي.

export type InstructionBlock = { id: string; title: string; content: string };

export type AgentPromptSource = {
  systemPrompt: string;
  instructions?: unknown; // Json من Prisma
  skills?: unknown; // Json من Prisma
  skillPrompts?: unknown; // Json من Prisma — نصوص مخصصة لكل مهارة
};

// تطبيع حقل instructions القادم من قاعدة البيانات — يتجاهل العناصر غير الصالحة
export function parseInstructionBlocks(raw: unknown): InstructionBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" &&
        typeof (item as Record<string, unknown>).title === "string" &&
        typeof (item as Record<string, unknown>).content === "string"
    )
    .map((item, i) => ({
      id: typeof item.id === "string" && item.id ? item.id : `block-${i}`,
      title: (item.title as string).trim(),
      content: (item.content as string).trim(),
    }))
    .filter((b) => b.title.length > 0 && b.content.length > 0);
}

// تطبيع حقل skills — يبقي المفاتيح المعروفة فقط ويحافظ على الترتيب
export function parseSkills(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(AGENT_SKILLS.map((s) => s.key));
  return raw.filter(
    (k): k is string => typeof k === "string" && known.has(k)
  );
}

// تطبيع حقل skillPrompts — يبقي النصوص غير الفارغة للمهارات المعروفة فقط
export function parseSkillPrompts(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const known = new Set(AGENT_SKILLS.map((s) => s.key));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (known.has(key) && typeof value === "string" && value.trim()) {
      out[key] = value.trim().slice(0, 2000);
    }
  }
  return out;
}

export function buildAgentSystemPrompt(agent: AgentPromptSource): string {
  const parts: string[] = [];
  const base = agent.systemPrompt.trim();
  if (base) parts.push(base);

  for (const block of parseInstructionBlocks(agent.instructions)) {
    parts.push(`## ${block.title}\n${block.content}`);
  }

  // كل مهارة مفعّلة قسم مستقل — النص المخصص في بطاقتها يتجاوز الافتراضي
  const prompts = parseSkillPrompts(agent.skillPrompts);
  const enabledSkills = new Set(parseSkills(agent.skills));
  for (const skill of AGENT_SKILLS) {
    if (!enabledSkills.has(skill.key)) continue;
    parts.push(`## ${skill.name}\n${prompts[skill.key] ?? skill.behavior}`);
  }

  return parts.join("\n\n");
}
