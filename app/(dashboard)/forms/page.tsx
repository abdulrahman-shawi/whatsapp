import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { FormsClient } from "@/components/forms/forms-client";
import type { LeadFormField } from "@/lib/lead-forms";

export const dynamic = "force-dynamic";

// نماذج استقبال العملاء: نماذج عامة تصل إرسالاتها صندوق الوارد محادثة واردة موسومة
export default async function FormsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  const forms = await prisma.leadForm.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">نماذج استقبال العملاء</h1>
        <p className="text-sm text-muted-foreground">
          نماذج عامة تصل إرسالاتها صندوق الوارد محادثة واردة مع وسم تلقائي
        </p>
      </div>
      <FormsClient
        initialForms={forms.map((f) => ({
          ...f,
          fields: f.fields as unknown as LeadFormField[],
          createdAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
