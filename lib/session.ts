import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// سياق الطلب: المستخدم + مساحة العمل الحالية — يعيد null إذا لم يكن مسجّلاً
export async function getWorkspaceContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
  });
  if (!membership) return null;

  return { userId: session.user.id, workspaceId: membership.workspaceId };
}
