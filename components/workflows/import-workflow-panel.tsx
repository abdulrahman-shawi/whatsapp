"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseWorkflowImport } from "@/components/workflows/workflow-io";

type Props = { open: boolean; onClose: () => void };

// لوحة استيراد سير عمل من ملف JSON أو لصق نص — تتحقق محلياً ثم تنشئ عبر API الإنشاء
export function ImportWorkflowPanel({ open, onClose }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit(raw: string) {
    setError(null);
    let parsed;
    try {
      parsed = parseWorkflowImport(raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ملف غير صالح");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: parsed.name,
        trigger: parsed.trigger,
        triggerConfig: parsed.triggerConfig,
        steps: parsed.steps,
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "فشل الاستيراد — حاول مرة أخرى");
      return;
    }
    setText("");
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
    router.refresh();
  }

  async function onFileChosen(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const raw = await file.text().catch(() => "");
    if (!raw.trim()) {
      setError("الملف فارغ");
      return;
    }
    await submit(raw);
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">استيراد سير عمل</CardTitle>
          <CardDescription>
            اختر ملف JSON صادراً من فلوفو، أو الصق محتواه في الحقل أدناه
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} title="إغلاق">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workflow-import-file">ملف JSON</Label>
          <input
            id="workflow-import-file"
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => void onFileChosen(e.target.files?.[0])}
            className="block w-full text-sm text-muted-foreground file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-secondary/80"
          />
          {fileName && <p className="text-xs text-muted-foreground">الملف المختار: {fileName}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="workflow-import-text">أو الصق محتوى JSON هنا</Label>
          <Textarea
            id="workflow-import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            dir="ltr"
            placeholder='{"flovooWorkflow": 1, ...}'
            disabled={busy}
            className="font-mono text-xs"
          />
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            disabled={busy || !text.trim()}
            onClick={() => void submit(text)}
          >
            <FileUp className="h-4 w-4" />
            {busy ? "جارٍ الاستيراد…" : "استيراد من النص"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
