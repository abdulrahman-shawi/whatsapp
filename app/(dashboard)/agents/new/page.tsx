import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { AgentStudio } from "@/components/agents/agent-studio";

export const dynamic = "force-dynamic";

// إنشاء وكيل جديد — الاستوديو بوضع المسودة (بلا معرف وكيل بعد)
export default async function NewAgentPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  return (
    <div className="mx-auto max-w-6xl">
      <AgentStudio />
    </div>
  );
}
