"use client";

import { useEffect } from "react";
import { Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// حدود خطأ صندوق الوارد: أي فشل في تحميل الصفحة (شبكة، قاعدة بيانات نائمة…)
// يظهر هنا بدل صفحة العطل الافتراضية — مع زر إعادة تحميل تلتقط استيقاظ قاعدة Neon
export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // تسجيل الخطأ في وحدة تحكم المتصفح لتشخيصه لاحقاً
    console.error("[inbox] فشل تحميل صندوق الوارد:", error);
  }, [error]);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 rounded-xl border bg-card p-6 text-center">
      <Inbox className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="font-semibold">تعذّر تحميل صندوق الوارد</p>
        <p className="mt-1 text-sm text-muted-foreground">
          غالباً انقطاع مؤقت بالشبكة أو قاعدة البيانات نائمة — أعد المحاولة
          {error.digest ? ` (المرجع: ${error.digest})` : ""}
        </p>
      </div>
      <Button onClick={reset}>
        <RefreshCw className="h-4 w-4" />
        إعادة المحاولة
      </Button>
    </div>
  );
}
