"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/time";

type AgentVersion = {
  id: string;
  name: string;
  createdAt: string;
  createdByName: string | null;
};

// سجل إصدارات الوكيل: لقطة محفوظة عند كل حفظ — مع استعادة الإعدادات من أي إصدار
// الاستعادة لا تمسّ مصادر المعرفة الحالية
export function AgentVersions({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<AgentVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && versions === null) {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/agents/${agentId}/versions`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? "تعذر تحميل سجل الإصدارات");
        } else {
          setVersions(data.versions);
        }
      } catch {
        setError("تعذر تحميل سجل الإصدارات");
      } finally {
        setLoading(false);
      }
    }
  }

  async function restore(version: AgentVersion) {
    if (
      !confirm(
        `استعادة إعدادات الوكيل من إصدار "${version.name}"؟ ستُستبدل الإعدادات الحالية (دون مصادر المعرفة).`
      )
    ) {
      return;
    }
    setRestoringId(version.id);
    setError("");
    setNote("");
    try {
      const res = await fetch(`/api/agents/${agentId}/versions/${version.id}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "حدث خطأ أثناء الاستعادة");
        return;
      }
      setNote("تمت الاستعادة بنجاح — جارٍ تحديث النموذج…");
      router.refresh();
    } catch {
      setError("حدث خطأ أثناء الاستعادة");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full items-center justify-between"
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <History className="h-5 w-5" />
          سجل الإصدارات
        </h2>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            لقطة محفوظة تلقائياً من إعدادات الوكيل عند كل حفظ — يمكن استعادة
            الإعدادات من أي إصدار دون المساس بمصادر المعرفة الحالية.
          </p>
          {loading && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ التحميل…
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {note && <p className="text-sm text-emerald-600">{note}</p>}
          {!loading && versions !== null && versions.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد إصدارات محفوظة بعد</p>
          )}
          {!loading &&
            versions?.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {relativeTime(v.createdAt)}
                    {v.createdByName && ` — بواسطة ${v.createdByName}`}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={restoringId !== null}
                  onClick={() => void restore(v)}
                >
                  {restoringId === v.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  استعادة
                </Button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
