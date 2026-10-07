"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Copy, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates";
import { stepPreview, triggerLabels } from "@/components/workflows/workflow-io";

// معرض قوالب الأتمتة الجاهزة — كل قالب يُنشأ نسخة منه عبر واجهة برمجية الإنشاء
export function TemplatesGallery() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function useTemplate(key: string) {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    setError(null);
    setBusyKey(key);
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${tpl.name} (قالب)`,
        trigger: tpl.trigger,
        triggerConfig: tpl.triggerConfig,
        steps: tpl.steps,
      }),
    });
    const data = await res.json().catch(() => null);
    setBusyKey(null);
    if (!res.ok) {
      setError(data?.error ?? "تعذّر إنشاء سير العمل من القالب");
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">قوالب جاهزة</CardTitle>
          <CardDescription>
            أتمتات شائعة بضغطة واحدة — تُنشأ كمسودة ويمكنك تعديلها قبل تفعيلها
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {open ? "إخفاء" : "عرض"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {WORKFLOW_TEMPLATES.map((tpl) => (
              <Card key={tpl.key} className="flex flex-col">
                <CardHeader className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{tpl.name}</CardTitle>
                    <Badge variant="secondary">{triggerLabels[tpl.trigger]}</Badge>
                  </div>
                  <CardDescription className="text-xs leading-relaxed">
                    {tpl.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  {previewKey === tpl.key && (
                    <ol className="space-y-1.5 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                      {tpl.steps.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-medium text-foreground">{i + 1}.</span>
                          <span>{stepPreview(s)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busyKey !== null}
                      onClick={() => void useTemplate(tpl.key)}
                    >
                      <Copy className="h-4 w-4" />
                      {busyKey === tpl.key ? "جارٍ الإنشاء…" : "استخدام القالب"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPreviewKey(previewKey === tpl.key ? null : tpl.key)}
                    >
                      <Eye className="h-4 w-4" />
                      {previewKey === tpl.key ? "إخفاء المعاينة" : "معاينة"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
