"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

// مبدّل مساحات العمل: يعرض المساحات الحالية ويضبط كوكي "ws" عند التبديل
export function WorkspaceSwitcher({
  currentWorkspaceId,
}: {
  currentWorkspaceId: string;
}) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<
    { id: string; name: string; role: string }[]
  >([]);
  const [currentId, setCurrentId] = useState(currentWorkspaceId);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.workspaces) setWorkspaces(data.workspaces);
      })
      .catch(() => {});
  }, []);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const workspaceId = e.target.value;
    if (!workspaceId || workspaceId === currentId) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        setCurrentId(workspaceId);
        router.refresh();
      }
    } finally {
      setSwitching(false);
    }
  }

  if (workspaces.length === 0) return null;

  return (
    <div className="mb-4">
      <label
        htmlFor="workspace-switcher"
        className="mb-1 flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
      >
        <Building2 className="h-3.5 w-3.5" />
        مساحة العمل
      </label>
      <select
        id="workspace-switcher"
        value={currentId}
        onChange={onChange}
        disabled={switching}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}
