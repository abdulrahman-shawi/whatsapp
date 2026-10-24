import { AGENT_SKILLS } from "@/lib/agent-skills";

// بناء برومبت النظام الكامل للوكيل من حقوله المخزنة:
// تعليمات أساسية + أقسام التعليمات + سلوكيات المهارات المفعّلة.
// يستخدمه محرك الرسائل ومسار الاختبار معاً حتى تطابق التجربة السلوك الفعلي.

export type InstructionBlock = { id: string; title: string; content: string };

export type AgentPromptSource = {
  systemPrompt: string;
  instructions?: unknown; // Json من Prisma
  skills?: unknown; // Json من Prisma
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

export function buildAgentSystemPrompt(agent: AgentPromptSource): string {
  const parts: string[] = [];
  const base = agent.systemPrompt.trim();
  if (base) parts.push(base);

  for (const block of parseInstructionBlocks(agent.instructions)) {
    parts.push(`## ${block.title}\n${block.content}`);
  }

  const skills = parseSkills(agent.skills);
  if (skills.length > 0) {
    const behaviors = AGENT_SKILLS.filter((s) => skills.includes(s.key)).map(
      (s) => `- ${s.behavior}`
    );
    parts.push(`## مهاراتك أثناء المحادثة\n${behaviors.join("\n")}`);
  }

  return parts.join("\n\n");
}
