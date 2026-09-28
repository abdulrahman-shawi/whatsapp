"use client";

import PusherClient from "pusher-js";

// عميل Pusher للمتصفح — يُنشأ فقط عند توفر متغيرات البيئة العامة
// وإلا يعيد null ويعتمد صندوق الوارد على الاستطلاع الدوري
let instance: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null;

  if (!instance) {
    instance = new PusherClient(key, {
      cluster,
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
    });
  }
  return instance;
}
