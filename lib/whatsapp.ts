// إرسال رسالة واتساب عبر Meta Cloud API — يعيد false عند أي فشل دون رمي أخطاء
// بيانات الاعتماد تُمرَّر من المتصل (من إعدادات مساحة العمل أو .env)
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  creds: { token: string; phoneNumberId: string } | null
): Promise<boolean> {
  if (!creds) return false;

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
