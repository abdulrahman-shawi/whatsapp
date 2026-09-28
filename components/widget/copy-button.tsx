"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

// زر نسخ كود التضمين مع تأكيد "تم النسخ"
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // بعض المتصفحات تمنع الحافظة — نتجاهل بهدوء
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? (
        <>
          <Check className="h-4 w-4 text-emerald-600" />
          تم النسخ
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          نسخ الكود
        </>
      )}
    </Button>
  );
}
