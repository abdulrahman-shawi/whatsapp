"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type PlanOption = {
  code: string;
  name: string;
  priceMonthly: number;
};

export function WorkspacePlanControl({
  workspaceId,
  currentPlanCode,
  plans,
}: {
  workspaceId: string;
  currentPlanCode: string;
  plans: PlanOption[];
}) {
  const [selectedPlan, setSelectedPlan] = useState(currentPlanCode);
  const [assignedPlan, setAssignedPlan] = useState(currentPlanCode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function handleAssign() {
    setSaving(true);
    setMessage("");
    setError(false);

    try {
      const response = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: selectedPlan, workspaceId }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(true);
        setMessage(data?.error ?? "تعذر تعيين الباقة");
        return;
      }

      setAssignedPlan(selectedPlan);
      setMessage("تم التعيين");
    } catch {
      setError(true);
      setMessage("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  const assignedPlanName = plans.find((plan) => plan.code === assignedPlan)?.name;

  return (
    <div className="flex min-w-56 flex-wrap items-center gap-2">
      <span>{assignedPlanName ?? "بدون باقة"}</span>
      <select
        aria-label="تغيير باقة مساحة العمل"
        value={selectedPlan}
        onChange={(event) => {
          setSelectedPlan(event.target.value);
          setMessage("");
        }}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="" disabled>
          اختر باقة
        </option>
        {plans.map((plan) => (
          <option key={plan.code} value={plan.code}>
            {plan.name} — ${plan.priceMonthly}/شهر
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={saving || !selectedPlan || selectedPlan === assignedPlan}
        onClick={handleAssign}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "تعيين"}
      </Button>
      {message && (
        <span
          className={`w-full text-xs ${error ? "text-destructive" : "text-emerald-700"}`}
          role={error ? "alert" : "status"}
        >
          {message}
        </span>
      )}
    </div>
  );
}
