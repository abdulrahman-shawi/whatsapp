import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workspaceHostTarget } from "@/lib/workspace-domains";

// سياق الطلب: المستخدم + مساحة العمل الحالية + دوره — يعيد null إذا لم يكن مسجّلاً
export async function getWorkspaceContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
  });
  if (memberships.length === 0) return null;

  const hostTarget = workspaceHostTarget(headers().get("host"));
  const hostWorkspace = hostTarget
    ? await prisma.workspace.findFirst({
        where: hostTarget.subdomain
          ? { subdomain: hostTarget.subdomain }
          : {
              customDomain: hostTarget.customDomain,
              customDomainVerifiedAt: { not: null },
            },
        select: { id: true },
      })
    : null;
  if (hostWorkspace) {
    const membership = memberships.find(
      (item) => item.workspaceId === hostWorkspace.id
    );
    if (!membership) return null;
    return {
      userId: session.user.id,
      workspaceId: membership.workspaceId,
      role: membership.role,
    };
  }

  // كوكي "ws" يحدد مساحة العمل المختارة — نتجاهله إن لم يكن المستخدم عضواً فيها
  const requestedId = cookies().get("ws")?.value;
  const membership =
    memberships.find((m) => m.workspaceId === requestedId) ?? memberships[0];

  return {
    userId: session.user.id,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}

export type WorkspaceContext = NonNullable<
  Awaited<ReturnType<typeof getWorkspaceContext>>
>;
