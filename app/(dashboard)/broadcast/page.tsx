import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { BroadcastClient } from "@/components/broadcast/broadcast-client";

export const dynamic = "force-dynamic";

// حملات البث الجماعي: إرسال رسالة واحدة لكل جهات الاتصال الحاملة لتسمية
export default async function BroadcastPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  const [campaigns, contacts, templates, clicks] = await Promise.all([
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
    prisma.broadcastClick.groupBy({
      by: ["campaignId", "variant"],
      _count: true,
    }),
  ]);

  // تجميع التسميات المستعملة من جهات الاتصال
  const tags = [...new Set(contacts.flatMap((c) => c.tags))].sort();
  // عدد النقرات لكل حملة ولكل نسخة (A/B) — يُعرض في سجل الحملات كنسبة تفاعل
  const clickStatsByCampaign = new Map<string, { a: number; b: number }>();
  for (const c of clicks) {
    const entry = clickStatsByCampaign.get(c.campaignId) ?? { a: 0, b: 0 };
    if (c.variant === "B") entry.b += c._count;
    else entry.a += c._count;
    clickStatsByCampaign.set(c.campaignId, entry);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">حملات البث الجماعي</h1>
        <p className="text-sm text-muted-foreground">
          أرسل رسالة واحدة لكل العملاء الموسومين بتسمية معينة
        </p>
      </div>
      <BroadcastClient
        initialCampaigns={campaigns.map((c) => {
          const stats = clickStatsByCampaign.get(c.id) ?? { a: 0, b: 0 };
          return {
            ...c,
            clickCount: stats.a + stats.b,
            clickCountA: stats.a,
            clickCountB: stats.b,
            createdAt: c.createdAt.toISOString(),
            scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
          };
        })}
        tags={tags}
        templates={templates}
      />
    </div>
  );
}
