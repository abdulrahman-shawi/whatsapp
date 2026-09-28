import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { TrainingClient } from "@/components/agents/training-client";

export const dynamic = "force-dynamic";

// صفحة التدريب: محادثات الوكيل مع رسائلها لتقييم الردود وبناء المعرفة
export default async function TrainingPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true, name: true },
  });
  if (!agent) notFound();

  // أحدث ٥٠ محادثة للوكيل مع رسائلها مرتبة زمنياً
  const conversations = await prisma.conversation.findMany({
    where: { workspaceId: ctx.workspaceId, agentId: agent.id },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
    take: 50,
    include: {
      contact: { select: { name: true, waPhone: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">تدريب: {agent.name}</h1>
        <p className="text-sm text-muted-foreground">
          قيّم ردود الوكيل وأضف الأسئلة المهمة إلى قاعدة المعرفة
        </p>
      </div>
      <TrainingClient
        agentId={agent.id}
        conversations={conversations.map((c) => ({
          id: c.id,
          platform: c.platform,
          status: c.status,
          lastMessageAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
          contactName: c.contact.name,
          contactPhone: c.contact.waPhone,
          messages: c.messages.map((m) => ({
            id: m.id,
            direction: m.direction,
            senderType: m.senderType,
            body: m.body,
            rating: m.rating,
            createdAt: m.createdAt.toISOString(),
          })),
        }))}
      />
    </div>
  );
}
