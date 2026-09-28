import Pusher from "pusher";

// خادم Pusher: يُنشأ فقط عند توفر جميع متغيرات البيئة، وإلا يبقى null
// (يبقى النظام يعمل بالاستطلاع الدوري عند غياب الإعداد)
const globalForPusher = globalThis as unknown as { pusher: Pusher | null };

export function getPusher(): Pusher | null {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) return null;

  if (!globalForPusher.pusher) {
    globalForPusher.pusher = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
  }
  return globalForPusher.pusher;
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
  getPusher()
    ?.trigger(workspaceChannel(workspaceId), "new-message", {
      conversationId,
      message,
    })
    .catch((e) => console.error("[pusher] فشل بث new-message:", e));
}

// بث تحديث قائمة المحادثات (آخر رسالة / عدد غير المقروء)
export function triggerConversationUpdated(
  workspaceId: string,
  conversationId: string
) {
  getPusher()
    ?.trigger(workspaceChannel(workspaceId), "conversation-updated", {
      conversationId,
    })
    .catch((e) => console.error("[pusher] فشل بث conversation-updated:", e));
}
