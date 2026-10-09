"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// نفس تحقق الخادم في lib/theme.ts — يُكرَّر هنا حتى لا يُستورد Prisma في متصفح العميل
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

// نموذج لون العلامة: منتقي لون مع حقل نصي متزامن — يُطبَّق على لوحة التحكم كلها
export function AppearanceForm({ initialColor }: { initialColor: string }) {
  const [color, setColor] = useState(initialColor);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const valid = isValidHexColor(color);

  // حفظ اللون في إعدادات مساحة العمل — يظهر أثره فوراً في الواجهة
  async function save() {
    if (saving || !valid) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: color.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "تعذّر الحفظ — حاول مجدداً");
      setFeedback({ ok: true, text: "تم حفظ اللون" });
    } catch (e) {
      setFeedback({
        ok: false,
        text: e instanceof Error ? e.message : "تعذّر الحفظ — حاول مجدداً",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">لون العلامة</CardTitle>
        <CardDescription>
          اللون الأساسي لمساحة عملك — يُطبَّق على الأزرار والروابط وعناصر
          الواجهة في لوحة التحكم كلها
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="theme-color">اللون الأساسي</Label>
          <div className="flex gap-2" dir="ltr">
            <input
              type="color"
              id="theme-color"
              value={valid ? color : "#000000"}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
            />
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#7c3aed"
              className="font-mono text-sm"
            />
          </div>
          {!valid && (
            <p className="text-xs text-destructive">
              صيغة اللون يجب أن تكون ‎#rgb أو ‎#rrggbb مثل ‎#7c3aed
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving || !valid}>
            {saving ? "جارٍ الحفظ…" : "حفظ اللون"}
          </Button>
          {feedback && (
            <span
              className={
                feedback.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"
              }
            >
              {feedback.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
