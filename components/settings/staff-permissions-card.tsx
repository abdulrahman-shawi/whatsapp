"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

// بطاقة صلاحيات الفريق: تقييد الموظف لمحادثاته المسندة إليه فقط
// للمالك فقط — تحفظ عبر PATCH /api/workspaces
export function StaffPermissionsCard({
  initialRestricted,
}: {
  initialRestricted: boolean;
}) {
  const [restricted, setRestricted] = useState(initialRestricted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleToggle(next: boolean) {
    setSaving(true);
    setError("");
    const res = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restrictStaff: next }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء الحفظ");
      return;
    }
    setRestricted(next);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <Label htmlFor="restrict-staff" className="font-semibold">
            صلاحيات الفريق
          </Label>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">
            تحكّم فيما يراه الموظفون في صندوق الوارد — لا يؤثر على المالك
          </p>
          <label
            htmlFor="restrict-staff"
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              id="restrict-staff"
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={restricted}
              disabled={saving}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            <span className="text-sm font-medium">
              الموظف يرى محادثاته المسندة إليه فقط
            </span>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            عند التفعيل يختفي من وارد الموظف كل ما لم يُسند إليه (بما فيه غير
            المسندة ونتائج البحث)، ولا يستطيع فتح محادثة غير مسندة إليه حتى لو
            عرف رابطها — أما المالك فيرى كل شيء دائماً
          </p>
          {error && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
