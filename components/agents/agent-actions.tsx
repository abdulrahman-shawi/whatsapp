"use client";

import { useRouter } from "next/navigation";
import { Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// أزرار بطاقة الوكيل: تفعيل/إيقاف وحذف
export function AgentActions({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();

  async function toggleActive() {
    await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("هل أنت متأكد من حذف هذا الوكيل؟ لا يمكن التراجع.")) return;
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleActive}
        className={isActive ? "text-amber-600" : "text-emerald-600"}
      >
        <Power className="h-4 w-4" />
        {isActive ? "إيقاف" : "تفعيل"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        حذف
      </Button>
    </div>
  );
}
