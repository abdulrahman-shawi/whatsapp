import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { AgentForm } from "@/components/agents/agent-form";

export const dynamic = "force-dynamic";

// إنشاء وكيل جديد
export default async function NewAgentPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">وكيل جديد</h1>
      <AgentForm />
    </div>
  );
}
