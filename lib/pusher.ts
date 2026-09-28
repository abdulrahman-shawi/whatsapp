import Pusher from "pusher";
import { getIntegration } from "@/lib/settings";

// خادم Pusher لكل مساحة عمل: المفاتيح من إعداداتها مع .env كبديل
// يعيد null عند نقص أي مفتاح (يبقى النظام يعمل بالاستطلاع الدوري)
// تُخزّن النسخ مؤقتاً حسب مجموعة المفاتيح
const cache = new Map<string, Pusher>();

export async function getPusherServer(
  workspaceId: string
): Promise<Pusher | null> {
  const [appId, key, secret, cluster] = await Promise.all([
    getIntegration(workspaceId, "PUSHER_APP_ID"),
    getIntegration(workspaceId, "PUSHER_KEY"),
    getIntegration(workspaceId, "PUSHER_SECRET"),
    getIntegration(workspaceId, "PUSHER_CLUSTER"),
  ]);
  if (!appId || !key || !secret || !cluster) return null;

  const cacheKey = [appId, key, secret, cluster].join("|");
  let pusher = cache.get(cacheKey);
  if (!pusher) {
    pusher = new Pusher({ appId, key, secret, cluster, useTLS: true });
    cache.set(cacheKey, pusher);
  }
  return pusher;
}

// اسم القناة الخاصة بمساحة العمل
export function workspaceChannel(workspaceId: string): string {
  return `private-workspace-${workspaceId}`;
}

// بث رسالة جديدة — أفضل-جهد: الفشل لا يوقف العملية الأساسية
export function triggerNewMessage(
  workspaceId: string,
  conversationId: string,
  message: unknown
) {
  getPusherServer(workspaceId)
    .then((pusher) =>
      pusher?.trigger(workspaceChannel(workspaceId), "new-message", {
        conversationId,
        message,
      })
    )
    .catch((e) => console.error("[pusher] فشل بث new-message:", e));
}

// بث تحديث قائمة المحادثات (آخر رسالة / عدد غير المقروء)
export function triggerConversationUpdated(
  workspaceId: string,
  conversationId: string
) {
  getPusherServer(workspaceId)
    .then((pusher) =>
      pusher?.trigger(workspaceChannel(workspaceId), "conversation-updated", {
        conversationId,
      })
    )
    .catch((e) => console.error("[pusher] فشل بث conversation-updated:", e));
}
