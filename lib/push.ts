import { prisma } from "@/lib/prisma";

type WebPushModule = typeof import("web-push");

let webPushModule: WebPushModule | null = null;
let vapidDetailsSet = false;

// استيراد كسول: web-push حزمة خادم فقط ولا يجوز تحميلها في المتصفح
async function loadWebPush(): Promise<WebPushModule | null> {
  if (webPushModule) return webPushModule;
  try {
    webPushModule = await import("web-push");
    return webPushModule;
  } catch (e) {
    console.error("[push] تعذّر تحميل web-push:", e);
    return null;
  }
}

// هل مفاتيح VAPID مهيأة على الخادم؟ (بدونها لا نحاول إرسال أي إشعار)
export function pushKeysConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
}

async function ensureVapidDetails(wp: WebPushModule): Promise<boolean> {
  if (vapidDetailsSet) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  wp.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@flovoo.app",
    publicKey,
    privateKey
  );
  vapidDetailsSet = true;
  return true;
}

// إرسال إشعار Push لكل اشتراكات مستخدم — أفضل-جهد بالكامل
// الاشتراكات المنتهية (404/410) تُحذف من القاعدة تلقائياً
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string | null }
): Promise<void> {
  try {
    if (!pushKeysConfigured()) return;
    const wp = await loadWebPush();
    if (!wp || !(await ensureVapidDetails(wp))) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subscriptions.length === 0) return;

    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/inbox",
    });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await wp.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
            data
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // اشتراك منتهٍ — نظّفه
            await prisma.pushSubscription
              .delete({ where: { endpoint: sub.endpoint } })
              .catch(() => {});
          } else {
            console.error("[push] فشل إرسال إشعار:", e);
          }
        }
      })
    );
  } catch (e) {
    console.error("[push] خطأ في sendPushToUser:", e);
  }
}
