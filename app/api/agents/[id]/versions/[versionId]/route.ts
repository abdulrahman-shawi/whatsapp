import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// استعادة إعدادات الوكيل من نسخة محفوظة — المالك فقط
// لا تُستعاد مصادر المعرفة من اللقطة: تبقى كما هي حالياً
export async function POST(
  _req: Request,
  { params }: { params: { id: string; versionId: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الاستعادة للمالك فقط" }, { status: 403 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!agent) return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });

  const version = await prisma.agentVersion.findFirst({
    where: { id: params.versionId, agentId: params.id },
  });
  if (!version) return NextResponse.json({ error: "الإصدار غير موجود" }, { status: 404 });

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: {
      name: version.name,
      systemPrompt: version.systemPrompt,
      welcomeMessage: version.welcomeMessage,
      responseDelaySec: version.responseDelaySec,
      handoffKeywords: version.handoffKeywords,
    },
  });

  // لقطة جديدة للحالة بعد الاستعادة — تُبقي الاستعادة نفسها قابلة للتدقيق والتراجع
  const knowledge = await prisma.knowledgeSource.findMany({
    where: { agentId: agent.id },
    select: { title: true, type: true, content: true },
  });
  await prisma.agentVersion.create({
    data: {
      agentId: agent.id,
      name: updated.name,
      systemPrompt: updated.systemPrompt,
      welcomeMessage: updated.welcomeMessage,
      responseDelaySec: updated.responseDelaySec,
      handoffKeywords: updated.handoffKeywords,
      knowledge,
      createdById: ctx.userId,
    },
  });

  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "UPDATE",
    entity: "agent",
    entityId: agent.id,
    meta: { name: updated.name, restoredFromVersionId: version.id },
  });

  return NextResponse.json({
    agent: updated,
    note: "تمت استعادة الإعدادات دون مصادر المعرفة",
  });
}
