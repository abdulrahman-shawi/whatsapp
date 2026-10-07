import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// تسلسل الوكيل للعميل مع عدّاداته
function serialize(a: {
  id: string;
  name: string;
  systemPrompt: string;
  welcomeMessage: string;
  responseDelaySec: number;
  handoffKeywords: string[];
  isActive: boolean;
  createdAt: Date;
  _count: { knowledgeSources: number; conversations: number };
}) {
  return { ...a, createdAt: a.createdAt.toISOString() };
}

// قائمة وكلاء مساحة العمل
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const agents = await prisma.agent.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { knowledgeSources: true, conversations: true } },
    },
  });
  return NextResponse.json({ agents: agents.map(serialize) });
}

// إنشاء وكيل جديد — يقبل مصادر معرفة نصية مبدئية من نموذج الإنشاء
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    typeof body.systemPrompt !== "string" ||
    !body.systemPrompt.trim()
  ) {
    return NextResponse.json(
      { error: "اسم الوكيل وتعليمات النظام مطلوبة" },
      { status: 400 }
    );
  }

  const sources = Array.isArray(body.knowledgeSources)
    ? body.knowledgeSources.filter(
        (s: unknown) =>
          s &&
          typeof (s as { title?: unknown }).title === "string" &&
          typeof (s as { content?: unknown }).content === "string"
      )
    : [];

  const agent = await prisma.agent.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: body.name.trim(),
      systemPrompt: body.systemPrompt.trim(),
      welcomeMessage:
        typeof body.welcomeMessage === "string" ? body.welcomeMessage : "",
      responseDelaySec:
        Number.isInteger(body.responseDelaySec) && body.responseDelaySec >= 0
          ? body.responseDelaySec
          : 3,
      handoffKeywords: Array.isArray(body.handoffKeywords)
        ? body.handoffKeywords.filter((k: unknown) => typeof k === "string")
        : [],
      isActive: body.isActive !== false,
      knowledgeSources: {
        create: sources.map(
          (s: { title: string; content: string }) => ({
            type: "TEXT" as const,
            title: s.title,
            content: s.content,
          })
        ),
      },
    },
    include: {
      _count: { select: { knowledgeSources: true, conversations: true } },
    },
  });

  // تدقيق إنشاء الوكيل
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "CREATE",
    entity: "agent",
    entityId: agent.id,
    meta: { name: agent.name },
  });

  return NextResponse.json({ agent: serialize(agent) }, { status: 201 });
}
