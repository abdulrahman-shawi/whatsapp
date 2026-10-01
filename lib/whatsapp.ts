import { getIntegration } from "@/lib/settings";

// بيانات اعتماد الإرسال: ميتا أولاً، وإن كانت حقوله فارغة نستخدم UltraMsg
export type WhatsAppCreds =
  | { provider: "meta"; token: string; phoneNumberId: string }
  | { provider: "ultramsg"; instanceId: string; token: string };

// حلّ مزوّد واتساب لمساحة العمل: Meta إن اكتملت حقوله، وإلا UltraMsg
export async function resolveWhatsAppCreds(
  workspaceId: string
): Promise<WhatsAppCreds | null> {
  const [token, phoneNumberId, instanceId, ultramsgToken] = await Promise.all([
    getIntegration(workspaceId, "WHATSAPP_TOKEN"),
    getIntegration(workspaceId, "WHATSAPP_PHONE_NUMBER_ID"),
    getIntegration(workspaceId, "ULTRAMSG_INSTANCE_ID"),
    getIntegration(workspaceId, "ULTRAMSG_TOKEN"),
  ]);
  if (token && phoneNumberId) {
    return { provider: "meta", token, phoneNumberId };
  }
  if (instanceId && ultramsgToken) {
    return { provider: "ultramsg", instanceId, token: ultramsgToken };
  }
  return null;
}

// إرسال رسالة واتساب عبر المزوّد المختار — يعيد false عند أي فشل دون رمي أخطاء
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  creds: WhatsAppCreds | null
): Promise<boolean> {
  if (!creds) return false;
  return creds.provider === "meta"
    ? sendViaMeta(to, body, creds)
    : sendViaUltraMsg(to, body, creds);
}

async function sendViaMeta(
  to: string,
  body: string,
  creds: { token: string; phoneNumberId: string }
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body },
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function sendViaUltraMsg(
  to: string,
  body: string,
  creds: { instanceId: string; token: string }
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.ultramsg.com/${creds.instanceId}/messages/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: creds.token,
          to,
          body,
        }),
      }
    );
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as {
      sent?: string | boolean;
    } | null;
    return data?.sent === true || data?.sent === "true";
  } catch {
    return false;
  }
}
