import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WidgetSettings } from "@/components/widget/widget-settings";

export const dynamic = "force-dynamic";

// صفحة الويدجت: جلب الوكلاء النشطين لمساحة العمل
export default async function WidgetPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const agents = await prisma.agent.findMany({
    where: { workspaceId: ctx.workspaceId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الويدجت</h1>
        <p className="text-sm text-muted-foreground">
          أضف محادثة ذكية إلى موقعك بسطر واحد من الكود
        </p>
      </div>
      <WidgetSettings agents={agents} />
    </div>
  );
}
