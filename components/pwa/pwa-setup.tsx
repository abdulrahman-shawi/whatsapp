"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// إعداد PWA: تسجيل عامل الخدمة (في الإنتاج فقط) والتقاط حدث التثبيت
// بطاقة "تثبيت التطبيق" تُعرض لهذه الجلسة فقط وتُغلق بالضغط على ×
export function PwaSetup() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.error("[pwa] تعذّر تسجيل عامل الخدمة:", e);
      });
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!installEvent || dismissed) return null;

  const install = async () => {
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <div className="fixed bottom-4 start-4 z-50 flex w-64 items-center gap-2 rounded-md border bg-card p-3 shadow-lg">
      <img src="/icon-192.png" alt="فلووو" className="h-10 w-10 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">تثبيت التطبيق</p>
        <p className="text-xs text-muted-foreground">افتح فلووو كتطبيق مستقل</p>
      </div>
      <button
        onClick={install}
        className="shrink-0 rounded-sm bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
      >
        تثبيت
      </button>
      <button
        onClick={() => setDismissed(true)}
        title="إغلاق"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
