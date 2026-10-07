import type { WorkflowStep, TriggerConfig } from "@/lib/workflows";

// قالب أتمتة جاهز — يُنشأ نسخة منه عبر واجهة برمجية الإنشاء نفسها
export type WorkflowTemplate = {
  key: string;
  name: string;
  description: string;
  trigger: string;
  triggerConfig: TriggerConfig;
  steps: WorkflowStep[];
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "new-contact-welcome",
    name: "ترحيب العملاء الجدد",
    description:
      "يرسل رسالة ترحيب فور تسجيل عميل جديد، ثم رسالة متابعة لطيفة بعد ساعة إن لم يكمل الحوار.",
    trigger: "NEW_CONTACT",
    triggerConfig: {},
    steps: [
      {
        type: "SEND_MESSAGE",
        body: "أهلاً وسهلاً {{name}}! 👋 شكراً لتواصلك معنا. كيف نقدر نخدمك اليوم؟",
      },
      { type: "WAIT", minutes: 60 },
      {
        type: "SEND_MESSAGE",
        body: "مساء الخير {{name}}! ما زلنا هنا إذا احتجت أي استفسار — يسعدنا خدمتك في أي وقت.",
      },
    ],
  },
  {
    key: "no-reply-followup",
    name: "متابعة من لا يرد",
    description:
      "يتابع تلقائياً مع العملاء الذين صمتوا ٢٤ ساعة بعد آخر رسالة منهم، برسالة تشجعهم على إكمال الحوار.",
    trigger: "NO_REPLY",
    triggerConfig: { hours: 24 },
    steps: [
      {
        type: "SEND_MESSAGE",
        body: "عذراً {{name}}، بدوّر على ردك 🌷 إذا ما زال الاستفسار قائماً نحن جاهزون، وإذا اكتفيت فسعدنا بخدمتك!",
      },
    ],
  },
  {
    key: "win-back",
    name: "استرجاع العملاء الغائبين",
    description:
      "يعيد تفعيل العملاء الذين غابوا أسبوعاً كاملاً برسالة عرض خاص، ثم تذكير بعد يوم. يستخدم محفّز صمت العميل بمدة أسبوع لأن المحرك لا يملك محفّزاً مخصصاً للاسترجاع.",
    trigger: "NO_REPLY",
    triggerConfig: { hours: 168 },
    steps: [
      {
        type: "SEND_MESSAGE",
        body: "اشتقنا لك {{name}}! 🎁 لعودتك خصم خاص ١٥٪ على طلبك القادم — صالح لثلاثة أيام. راسلنا «أريد العرض» لنفعّله لك.",
      },
      { type: "WAIT", minutes: 1440 },
      {
        type: "SEND_MESSAGE",
        body: "تذكير أخير {{name}}: عودتك تسعدنا وخصمك ١٥٪ ما زال بانتظارك حتى نهاية اليوم!",
      },
    ],
  },
];
