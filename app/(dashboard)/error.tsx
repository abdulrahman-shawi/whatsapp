"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// حدود خطأ عامة لكل الصفحات: صفحة لطيفة بدل شاشة العطل الافتراضية
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] خطأ غير متوقع:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <TriangleAlert className="h-10 w-10 text-amber-500" />
      <div>
        <p className="font-semibold">حدث خطأ غير متوقع</p>
        <p className="mt-1 text-sm text-muted-foreground">
          جرّب إعادة المحاولة — وإن تكرر الخطأ أخبر الدعم
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
