import { prisma } from "@/lib/prisma";
import { LeadFormView } from "@/components/forms/lead-form-view";
import type { LeadFormField } from "@/lib/lead-forms";

export const dynamic = "force-dynamic";

// صفحة النموذج العامة — مفتوحة بلا تسجيل دخول لأي زائر يملك الرابط
export default async function PublicLeadFormPage({
  params,
}: {
  params: { id: string };
}) {
  const form = await prisma.leadForm.findUnique({
    where: { id: params.id },
    include: { workspace: { select: { name: true } } },
  });

  if (!form || !form.isActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-3xl font-bold text-muted-foreground">🙁</p>
          <h1 className="mt-3 text-xl font-semibold">
            هذا النموذج غير متاح حالياً
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تواصل مع الفريق مباشرة عبر واتساب
          </p>
        </div>
      </div>
    );
  }

  return (
    <LeadFormView
      formId={form.id}
      title={form.title}
      description={form.description}
      workspaceName={form.workspace.name}
      fields={form.fields as unknown as LeadFormField[]}
    />
  );
}
