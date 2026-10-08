import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ApiKeysClient } from "@/components/api-keys/api-keys-client";

export const dynamic = "force-dynamic";

// صفحة إدارة مفاتيح API للوصول البرمجي بالقراءة — للمالك فقط
export default async function ApiKeysPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER") redirect("/inbox");

  const keys = await prisma.apiKey.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  const serialized = keys.map((k) => ({
    ...k,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  }));

  return <ApiKeysClient initialKeys={serialized} />;
}
