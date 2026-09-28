"use client";

import type PusherClient from "pusher-js";
import type { Channel } from "pusher-js";

// عميل Pusher للمتصفح — يُهيّأ بعد جلب المفاتيح من الخادم
// (قاعدة البيانات أولاً ثم .env)، ويبقى null عند غيابها فنعتمد على الاستطلاع
let instance: PusherClient | null = null;
let initPromise: Promise<PusherClient | null> | null = null;

export function getPusherInstance(): PusherClient | null {
  return instance;
}

// تهيئة كسولة غير متزامنة — تُستدعى مرة واحدة وتُخزّن النتيجة
export function initPusherClient(): Promise<PusherClient | null> {
  if (instance) return Promise.resolve(instance);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const res = await fetch("/api/settings/client-config");
      if (!res.ok) return null;
      const { pusherKey, pusherCluster } = await res.json();
      if (!pusherKey || !pusherCluster) return null;

      // استيراد ديناميكي حتى لا تُحمَّل المكتبة دون حاجة
      const Pusher = (await import("pusher-js")).default;
      instance = new Pusher(pusherKey, {
        cluster: pusherCluster,
        channelAuthorization: {
          endpoint: "/api/pusher/auth",
          transport: "ajax",
        },
      });
      return instance;
    } catch {
      return null;
    }
  })();

  return initPromise;
}

export type { Channel };
