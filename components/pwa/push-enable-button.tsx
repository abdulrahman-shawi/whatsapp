"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

// تحويل مفتاح VAPID من Base64 URL-safe إلى Uint8Array (تنسيق applicationServerKey)
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type PushState = "loading" | "unsupported" | "off" | "subscribed" | "denied";

// زر تفعيل/إيقاف إشعارات المتصفح (Web Push) — يظهر داخل قائمة جرس الإشعارات
export function PushEnableButton() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : "off"))
      .catch(() => setState("off"));
  }, []);

  const subscribe = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/push/vapidkey");
      const { publicKey } = await res.json();
      if (!publicKey) {
        // Push غير مهيأ على الخادم — أبقِ الزر في حالة الإيقاف مع الملاحظة أدناه
        setState("off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
      });
      setState("subscribed");
    } catch (e) {
      console.error("[push] تعذّر الاشتراك:", e);
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        setState("denied");
      }
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      console.error("[push] تعذّر إلغاء الاشتراك:", e);
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return null;

  if (state === "unsupported") {
    return (
      <p className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
        <BellOff className="h-3.5 w-3.5" />
        متصفحك لا يدعم إشعارات Push
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
        <BellOff className="h-3.5 w-3.5" />
        الإشعارات محظورة من إعدادات المتصفح — اسمح بها ثم أعد تحميل الصفحة
      </p>
    );
  }

  if (state === "subscribed") {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground"
        disabled={busy}
        onClick={unsubscribe}
      >
        <BellOff className="h-4 w-4" />
        إيقاف إشعارات المتصفح
      </Button>
    );
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        disabled={busy}
        onClick={subscribe}
      >
        <BellRing className="h-4 w-4" />
        تفعيل إشعارات المتصفح
      </Button>
      <ServerPushNote />
    </div>
  );
}

// ملاحظة صامتة تظهر فقط إذا كان Push غير مفعّل على الخادم
function ServerPushNote() {
  const [serverOff, setServerOff] = useState(false);
  useEffect(() => {
    fetch("/api/push/vapidkey")
      .then((r) => r.json())
      .then((d) => setServerOff(!d.publicKey))
      .catch(() => {});
  }, []);
  if (!serverOff) return null;
  return (
    <p className="px-2 pt-1 text-[10px] text-muted-foreground">
      إشعارات Push غير مفعّلة على الخادم
    </p>
  );
}
