// كتالوج مهارات الوكيل: مفاتيحها تُخزَّن في Agent.skills وتتشاركه
// واجهة الاستوديو وباني البرومبت ومنفّذو الأدوات — مصدر واحد للحقيقة.

export type AgentSkill = {
  key: string; // يُخزَّن في Agent.skills
  name: string; // الاسم العربي في واجهة الاستوديو
  description: string; // سطر توضيحي تحت الاسم
  behavior: string; // النص الافتراضي لبطاقة المهارة — يُحقن في البرومبت ويظهر قابلاً للتحرير
  toolName: string; // اسم أداة OpenAI المنفَّذة
  toolDescription: string; // وصف الأداة للنموذج
  templates: { name: string; text: string }[]; // قوالب مطالبات تُدرج في نص المهارة
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
    templates: [
      {
        name: "جمع بيانات التواصل",
        text: "عندما تحتاج بريد العميل أو رقمه للمتابعة، اطلبهما بأدب وحدّث بطاقته فور إرسالهما إياه مع تأكيد الإدخال له بلطف.",
      },
      {
        name: "تصحيح الاسم",
        text: "إذا صحّح العميل اسمه أو طلب تغييره، حدّث الاسم في بطاقته واستخدم الاسم الجديد في بقية المحادثة.",
      },
    ],
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
    templates: [
      {
        name: "عند الاهتمام",
        text: "إذا أبدى العميل اهتماماً واضحاً بالمنتج أو طلب تفاصيل الشراء والدفع، حدّث مرحلته إلى INTERESTED.",
      },
      {
        name: "عند الشراء",
        text: "بعد تأكيد العميل طلبه أو إتمام الدفع، حدّث مرحلته إلى CUSTOMER وهنّئه بإتمام الطلب.",
      },
      {
        name: "عند فقدان الصفقة",
        text: "إذا أعلن العميل عدم الرغبة صراحة، أو توقف عن الرد بعد متابعتين متباعدتين، حدّث مرحلته إلى LOST مع تسجيل سبب الفقدان ملاحظة.",
      },
    ],
  },
  {
    key: "add_note",
    name: "إضافة تعليقات",
    description: "تسجيل تعليق داخلي على جهة اتصال العميل",
    behavior:
      "عندما ترد معلومة مهمة تستحق التوثيق (تفضيل، شكوى سابقة، طلب خاص، موعد متفق عليه)، سجّلها تعليقاً عبر الأداة المناسبة ليطلع عليها الفريق لاحقاً.",
    toolName: "add_note",
    toolDescription: "إضافة تعليق داخلي إلى جهة اتصال العميل",
    templates: [
      {
        name: "تعليق التسليم",
        text: "عند تسليم المحادثة لموظف، أضف تعليقاً يلخص طلب العميل وما تم الاتفاق عليه والخطوات التالية المطلوبة من الموظف.",
      },
      {
        name: "تعليق تصعيدي",
        text: "عند تصعيد شكوى أو مشكلة، أضف تعليقاً يتضمن ملخصاً للمشكلة وما تم تجربته حتى الآن وسبب التصعيد.",
      },
    ],
  },
  {
    key: "request_handoff",
    name: "طلب وكيل بشري",
    description: "تحويل المحادثة إلى فريق بشري مع ذكر السبب",
    behavior:
      "عندما يطلب العميل موظفاً بشرياً صراحة، أو تتعذّر مساعدته ويتطلب الأمر تدخلاً بشرياً، سلّم المحادثة للفريق عبر الأداة المناسبة مع سبب مختصر.",
    toolName: "request_human_handoff",
    toolDescription: "تسليم المحادثة الحالية إلى موظف بشري مع ذكر السبب",
    templates: [
      {
        name: "طلب صريح",
        text: "إذا طلب العميل موظفاً بشرياً صراحة، سلّم المحادثة فوراً مع سبب يذكر طلب العميل، واطمئنه أن الفريق سيتولى من هنا.",
      },
      {
        name: "عجز الوكيل",
        text: "إذا تجاوز طلب العميل صلاحياتك أو تعذّرت مساعدته بعد محاولتين، سلّم المحادثة للفريق المناسب مع ملخص موجز لما تم.",
      },
    ],
  },
  {
    key: "close_conversation",
    name: "إغلاق المحادثة",
    description: "إغلاق المحادثة بعد حل طلب العميل",
    behavior:
      "عندما يؤكد العميل حاجته أو شكره ولم يتبقَّ طلبات مفتوحة، أغلق المحادثة عبر الأداة المناسبة مع ملخص موجز لما تم.",
    toolName: "close_conversation",
    toolDescription: "إغلاق المحادثة الحالية مع ملخص اختياري",
    templates: [
      {
        name: "إغلاق بعد الحل",
        text: "أغلق المحادثة واكتب ملخصاً موجزاً لما تم عند تأكيد العميل حل مشكلته أو اكتمال طلبه بنجاح.",
      },
      {
        name: "إغلاق بعد المتابعة",
        text: "أغلق المحادثة إذا لم يستجب العميل بعد متابعة واضحة، مع ملاحظة تفيد بإمكان إعادة فتح المحادثة فور رده.",
      },
      {
        name: "إغلاق عند الاهتمام",
        text: "أغلق المحادثة بأدب إذا أكد العميل اكتمال حاجته وشكرك، وادعه للتواصل متى احتاج أي مساعدة.",
      },
    ],
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
