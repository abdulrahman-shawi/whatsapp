import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { BroadcastClient } from "@/components/broadcast/broadcast-client";

export const dynamic = "force-dynamic";

// حملات البث الجماعي: إرسال رسالة واحدة لكل جهات الاتصال الحاملة لتسمية
export default async function BroadcastPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const [campaigns, contacts, templates] = await Promise.all([
    prisma.broadcastCampaign.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.contact.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { tags: true },
    }),
    prisma.template.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // تجميع التسميات المستعملة من جهات الاتصال
  const tags = [...new Set(contacts.flatMap((c) => c.tags))].sort();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">حملات البث الجماعي</h1>
        <p className="text-sm text-muted-foreground">
          أرسل رسالة واحدة لكل العملاء الموسومين بتسمية معينة
        </p>
      </div>
      <BroadcastClient
        initialCampaigns={campaigns.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        }))}
        tags={tags}
        templates={templates}
      />
    </div>
  );
}
