"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

// مربع أمر طرفية قابل للنسخ (زر واحد مع تأكيد «تم النسخ»)
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // بعض المتصفحات تمنع الحافظة — نتجاهل بهدوء
    }
  }

  return (
    <div
      dir="ltr"
      className="my-2 flex items-center gap-2 rounded-md border bg-muted/50 p-2"
    >
      <code className="flex-1 overflow-x-auto whitespace-nowrap text-left text-xs">
        {command}
      </code>
      <Button variant="ghost" size="sm" onClick={copy}>
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs">تم النسخ</span>
          </>
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
