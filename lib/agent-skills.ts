// كتالوج مهارات الوكيل: مفاتيحها تُخزَّن في Agent.skills وتتشاركه
// واجهة الاستوديو وباني البرومبت ومنفّذو الأدوات — مصدر واحد للحقيقة.

export type AgentSkill = {
  key: string; // يُخزَّن في Agent.skills
  name: string; // الاسم العربي في واجهة الاستوديو
  description: string; // سطر توضيحي تحت الاسم
  behavior: string; // فقرة سلوك تُحقن في البرومبت عند تفعيل المهارة
  toolName: string; // اسم أداة OpenAI المنفَّذة
  toolDescription: string; // وصف الأداة للنموذج
};

export const AGENT_SKILLS: AgentSkill[] = [
  {
    key: "update_contact",
    name: "تحديث بيانات العميل",
    description: "تحديث الاسم والبريد والهاتف والوسوم من المحادثة",
    behavior:
      "عندما يذكر العميل بريداً إلكترونياً أو رقم هاتف بديلاً أو يصحّح اسمه، حدّث بيانات جهة الاتصال فوراً عبر الأداة المناسبة دون سؤاله إلا عند الالتباس.",
    toolName: "update_contact",
    toolDescription:
      "تحديث بيانات جهة اتصال العميل: الاسم، البريد الإلكتروني، الهاتف، الوسوم",
  },
  {
    key: "update_stage",
    name: "تحديث مرحلة العميل",
    description: "نقل العميل بين مراحل مسار البيع (مهتم، يفاوض، عميل…)",
    behavior:
      "قيّم نية العميل الشرائية من المحادثة، وعندما يتضح تقدّمه في مسار البيع (أصبح مهتماً أو يفاوض أو اشترى أو انسحب) حدّث مرحلته عبر الأداة المناسبة.",
    toolName: "update_contact_stage",
    toolDescription:
      "تحديث مرحلة العميل في مسار البيع: NEW عملية جديدة، CONTACTING جاري التواصل، INTERESTED مهتم، NEGOTIATING يفاوض، CUSTOMER عميل مشترٍ، LOST ضائع",
  },
  {
    key: "add_note",
    name: "إضافة ملاحظة",
    description: "تسجيل ملاحظة داخلية على جهة اتصال العميل",
    behavior:
      "عندما ترد معلومة مهمة تستحق التوثيق (تفضيل، شكوى سابقة، طلب خاص، موعد متفق عليه)، سجّلها ملاحظة عبر الأداة المناسبة لتطلع عليها الفريق لاحقاً.",
    toolName: "add_note",
    toolDescription: "إضافة ملاحظة داخلية إلى جهة اتصال العميل",
  },
  {
    key: "request_handoff",
    name: "طلب التسليم لموظف",
    description: "تحويل المحادثة إلى فريق بشري مع ذكر السبب",
    behavior:
      "عندما يطلب العميل موظفاً بشرياً صراحة، أو تتعذّر مساعدته ويتطلب الأمر تدخلاً بشرياً، سلّم المحادثة للفريق عبر الأداة المناسبة مع سبب مختصر.",
    toolName: "request_human_handoff",
    toolDescription: "تسليم المحادثة الحالية إلى موظف بشري مع ذكر السبب",
  },
  {
    key: "close_conversation",
    name: "إغلاق المحادثة",
    description: "إغلاق المحادثة بعد حل طلب العميل",
    behavior:
      "عندما يؤكد العميل حاجته أو شكره ولم يتبقَّ طلبات مفتوحة، أغلق المحادثة عبر الأداة المناسبة مع ملخص موجز لما تم.",
    toolName: "close_conversation",
    toolDescription: "إغلاق المحادثة الحالية مع ملخص اختياري",
  },
];

export function isAgentSkillKey(key: unknown): key is string {
  return typeof key === "string" && AGENT_SKILLS.some((s) => s.key === key);
}

// الأدوات المفتوحة لنموذج اللغة (صيغة OpenAI) لمهارات مفعّلة معطاة
export function toolsForSkills(skillKeys: string[]): {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}[] {
  const enabled = new Set(skillKeys);
  return AGENT_SKILLS.filter((s) => enabled.has(s.key)).map((s) => ({
    type: "function" as const,
    function: {
      name: s.toolName,
      description: s.toolDescription,
      parameters: toolParameters(s.toolName),
    },
  }));
}

function toolParameters(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case "update_contact":
      return {
        type: "object",
        properties: {
          name: { type: "string", description: "اسم العميل" },
          email: { type: "string", description: "البريد الإلكتروني" },
          phone: { type: "string", description: "رقم الهاتف" },
          tags: { type: "array", items: { type: "string" }, description: "وسوم" },
        },
      };
    case "update_contact_stage":
      return {
        type: "object",
        properties: {
          stage: {
            type: "string",
            enum: ["NEW", "CONTACTING", "INTERESTED", "NEGOTIATING", "CUSTOMER", "LOST"],
          },
        },
        required: ["stage"],
      };
    case "add_note":
      return {
        type: "object",
        properties: { note: { type: "string", description: "نص الملاحظة" } },
        required: ["note"],
      };
    case "request_human_handoff":
      return {
        type: "object",
        properties: { reason: { type: "string", description: "سبب التسليم" } },
      };
    case "close_conversation":
      return {
        type: "object",
        properties: { summary: { type: "string", description: "ملخص ما تم" } },
      };
    default:
      return { type: "object", properties: {} };
  }
}
