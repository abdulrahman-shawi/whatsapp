"use client";

import { stageConfig } from "@/lib/contact-stages";

// شارة مرحلة العميل في مسار البيع: نقطة ملونة + المسمى العربي
export function StageBadge({ stage, className = "" }: { stage: string; className?: string }) {
  const config = stageConfig(stage);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${className}`}
      title={config.label}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      {config.label}
    </span>
  );
}
