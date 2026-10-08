import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// حفظ إعدادات مظهر الويدجت لكل وكيل (عنوان/وصف/لون) ورسالة الترحيب
// المظهر يُخزَّن في إعدادات مساحة العمل بمفتاح widget:<agentId>، والترحيب على الوكيل نفسه
export async function PUT(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { agentId, title, subtitle, color, welcomeMessage } = body ?? {};

  if (typeof agentId !== "string" || !agentId) {
    return NextResponse.json({ error: "الوكيل مطلوب" }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim() || title.length > 80) {
    return NextResponse.json({ error: "العنوان غير صالح" }, { status: 400 });
  }
  if (typeof subtitle !== "string" || subtitle.length > 120) {
    return NextResponse.json({ error: "الوصف التعريفي غير صالح" }, { status: 400 });
  }
  if (
    typeof color !== "string" ||
    !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim())
  ) {
    return NextResponse.json({ error: "اللون غير صالح" }, { status: 400 });
  }
  if (typeof welcomeMessage !== "string" || welcomeMessage.length > 1000) {
    return NextResponse.json({ error: "رسالة الترحيب غير صالحة" }, { status: 400 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId: ctx.workspaceId },
    select: { id: true, name: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
  }

  const key = `widget:${agent.id}`;
  const value = JSON.stringify({
    title: title.trim(),
    subtitle: subtitle.trim(),
    color: color.trim(),
  });
  await prisma.setting.upsert({
    where: { workspaceId_key: { workspaceId: ctx.workspaceId, key } },
    create: { workspaceId: ctx.workspaceId, key, value },
    update: { value },
  });
  await prisma.agent.update({
    where: { id: agent.id },
    data: { welcomeMessage: welcomeMessage.trim() },
  });

  // تدقيق تحديث إعدادات الويدجت
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "UPDATE",
    entity: "setting",
    entityId: key,
    meta: { agent: agent.name },
  });

  return NextResponse.json({ ok: true });
}
