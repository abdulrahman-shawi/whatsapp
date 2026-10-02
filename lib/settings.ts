import { prisma } from "@/lib/prisma";

// مفاتيح التكامل المدعومة — القيمة من قاعدة البيانات أولاً ثم .env كبديل
export const INTEGRATION_KEYS = [
  { key: "AI_PROVIDER", label: "مزوّد الذكاء الاصطناعي", env: ["AI_PROVIDER"] },
  {
    key: "OPENAI_API_KEY",
    label: "مفتاح الذكاء الاصطناعي (API Key)",
    env: ["OPENAI_API_KEY"],
  },
  {
    key: "AI_MODEL",
    label: "اسم النموذج (اختياري)",
    env: ["AI_MODEL"],
  },
  {
    key: "AI_BASE_URL",
    label: "رابط API مخصص (اختياري)",
    env: ["AI_BASE_URL"],
  },
  { key: "WHATSAPP_TOKEN", label: "توكن واتساب", env: ["WHATSAPP_TOKEN"] },
  {
    key: "WHATSAPP_VERIFY_TOKEN",
    label: "توكن التحقق من الويب هوك",
    env: ["WHATSAPP_VERIFY_TOKEN"],
  },
  {
    key: "WHATSAPP_PHONE_NUMBER_ID",
    label: "معرّف رقم واتساب",
    env: ["WHATSAPP_PHONE_NUMBER_ID"],
  },
  { key: "META_APP_SECRET", label: "سر تطبيق Meta", env: ["META_APP_SECRET"] },
  {
    key: "ULTRAMSG_INSTANCE_ID",
    label: "معرّف نسخة UltraMsg",
    env: ["ULTRAMSG_INSTANCE_ID"],
  },
  { key: "ULTRAMSG_TOKEN", label: "توكن UltraMsg", env: ["ULTRAMSG_TOKEN"] },
  { key: "PUSHER_APP_ID", label: "معرّف تطبيق Pusher", env: ["PUSHER_APP_ID"] },
  {
    key: "PUSHER_KEY",
    label: "مفتاح Pusher",
    env: ["NEXT_PUBLIC_PUSHER_KEY", "PUSHER_KEY"],
  },
  { key: "PUSHER_SECRET", label: "سر Pusher", env: ["PUSHER_SECRET"] },
  {
    key: "PUSHER_CLUSTER",
    label: "عنقود Pusher",
    env: ["NEXT_PUBLIC_PUSHER_CLUSTER", "PUSHER_CLUSTER"],
  },
] as const;

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number]["key"];

// مفاتيح غير سرية — تُعرض قيمتها كنص صريح في الواجهة بدل الإخفاء
const NON_SECRET = new Set<string>(["AI_PROVIDER", "AI_MODEL", "AI_BASE_URL"]);

// خيارات القائمة المنسدلة للمفاتيح التي تُختار من قائمة بدل الإدخال الحر
export const KEY_OPTIONS: Partial<
  Record<IntegrationKey, readonly { value: string; label: string }[]>
> = {
  AI_PROVIDER: [
    { value: "openai", label: "OpenAI" },
    { value: "gemini", label: "Google Gemini" },
    { value: "kimi", label: "Kimi (Moonshot)" },
    { value: "openrouter", label: "OpenRouter (Claude وغيره)" },
    { value: "custom", label: "مخصص — رابط خاص" },
  ],
};

const KEY_SET = new Set<string>(INTEGRATION_KEYS.map((d) => d.key));

export function isIntegrationKey(key: string): key is IntegrationKey {
  return KEY_SET.has(key);
}

// قيمة .env البديلة لمفتاح — يجرّب كل الأسماء المعروفة بالترتيب
function envFallback(def: (typeof INTEGRATION_KEYS)[number]): string | null {
  for (const name of def.env) {
    const v = process.env[name];
    if (v) return v;
  }
  return null;
}

// قراءة مفتاح تكامل: قيمة قاعدة البيانات إن وُجدت وغير فارغة، وإلا .env
export async function getIntegration(
  workspaceId: string,
  key: IntegrationKey
): Promise<string | null> {
  const def = INTEGRATION_KEYS.find((d) => d.key === key)!;
  const row = await prisma.setting.findUnique({
    where: { workspaceId_key: { workspaceId, key } },
  });
  if (row?.value) return row.value;
  return envFallback(def);
}

// كل القيم الممكنة لمفتاح عبر مساحات العمل + .env
// يستخدمها الويب هوك الذي لا يعرف مساحة العمل وقت الطلب (MVP أحادي المستأجر)
export async function getIntegrationCandidates(key: IntegrationKey): Promise<string[]> {
  const def = INTEGRATION_KEYS.find((d) => d.key === key)!;
  const values = new Set<string>();
  const envVal = envFallback(def);
  if (envVal) values.add(envVal);
  const rows = await prisma.setting.findMany({ where: { key } });
  for (const r of rows) if (r.value) values.add(r.value);
  return [...values];
}

// إخفاء السر — نظهر آخر ٤ أحرف فقط
function mask(value: string): string {
  return value.length <= 4 ? "••••" : "••••••••" + value.slice(-4);
}

export type IntegrationInfo = {
  key: IntegrationKey;
  label: string;
  envName: string;
  masked: string | null;
  // القيمة الصريحة للمفاتيح غير السرية فقط — null للسرية
  value: string | null;
  secret: boolean;
  options: readonly { value: string; label: string }[] | null;
  source: "db" | "env" | null;
};

// قائمة مقنّعة للعرض في الواجهة — القيم السرية لا تُرجع خاماً أبداً
export async function getIntegrationList(
  workspaceId: string
): Promise<IntegrationInfo[]> {
  const rows = await prisma.setting.findMany({
    where: { workspaceId, key: { in: [...KEY_SET] } },
  });

  return INTEGRATION_KEYS.map((def) => {
    const secret = !NON_SECRET.has(def.key);
    const options = KEY_OPTIONS[def.key] ?? null;
    const row = rows.find((r) => r.key === def.key);
    const raw = row?.value || envFallback(def);
    const source = row?.value ? "db" : raw ? "env" : null;
    return {
      key: def.key,
      label: def.label,
      envName: def.env[0],
      masked: secret && raw ? mask(raw) : null,
      value: secret ? null : raw,
      secret,
      options,
      source,
    };
  });
}
