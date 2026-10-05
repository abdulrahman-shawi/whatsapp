import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// سياق الطلب: المستخدم + مساحة العمل الحالية + دوره — يعيد null إذا لم يكن مسجّلاً
export async function getWorkspaceContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
  });
  if (memberships.length === 0) return null;

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
