import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveAiConfig, type ChatMessage } from "@/lib/openai";
import { generateWorkspaceReply } from "@/lib/billing/ai-usage";
import { workspaceIsReadOnly } from "@/lib/billing/workspace-access";
import { buildAgentSystemPrompt, parseSkills } from "@/lib/agent-prompt";
import { toolsForSkills } from "@/lib/agent-skills";
import { runAgentTools } from "@/lib/agent-tools";
import { collectAgentKnowledge } from "@/lib/retrieval";
import { detectLanguage, LANGUAGE_NAMES } from "@/lib/sentiment";

// تجربة الوكيل دون حفظ. وضعان:
// - وضع الوكيل المحفوظ: يمرّر agentId فيُبنى البرومبت من قاعدة البيانات (تعليمات + مهارات + معرفة)
// - وضع المسودة: تمرَّر الحالة الحالية (systemPrompt/instructions/skills/knowledge) دون حفظ
// المهارات المفعّلة تعمل بأدوات حقيقية؛ يلزم تمرير contactId و conversationId لتنفيذها فعلياً
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (await workspaceIsReadOnly(ctx.workspaceId)) {
    return NextResponse.json(
      { error: "انتهت التجربة المجانية؛ الترقية مطلوبة لاستخدام الذكاء الاصطناعي." },
      { status: 402 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || (!body.agentId && typeof body.systemPrompt !== "string")) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const messages: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m: unknown) =>
        m &&
        typeof (m as { content?: unknown }).content === "string" &&
        ["user", "assistant"].includes((m as { role?: string }).role ?? "")
    )
    .slice(-10);

  let systemPrompt: string;
  let knowledge: string[];
  let skills: string[];

  if (typeof body.agentId === "string" && body.agentId) {
    const agent = await prisma.agent.findFirst({
      where: { id: body.agentId, workspaceId: ctx.workspaceId },
      include: { knowledgeSources: true },
    });
    if (!agent) {
      return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
    }
    systemPrompt = buildAgentSystemPrompt(agent);
    skills = parseSkills(agent.skills);
    const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    knowledge = await collectAgentKnowledge(agent.knowledgeSources, lastUserText, "000000000000");
  } else {
    systemPrompt = buildAgentSystemPrompt({
      systemPrompt: body.systemPrompt,
      instructions: body.instructions,
      skills: body.skills,
    });
    skills = parseSkills(body.skills);
    knowledge = Array.isArray(body.knowledge)
      ? body.knowledge.filter((k: unknown) => typeof k === "string")
      : [];
  }

  // تعليمة الرد بلغة العميل — نفس ما يضيفه المحرك في الإنتاج
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lang = detectLanguage(lastUserText);
  knowledge = [
    ...knowledge,
    `أجب بلغة العميل نفسها (${LANGUAGE_NAMES[lang]}) حتى لو اختلفت لغة تعليماتك.`,
  ];

  // سياق تنفيذ الأدوات اختياري: بدونه تُعرض الاستدعاءات دون تنفيذ
  let toolCtx: { contactId: string; conversationId: string } | null = null;
  if (typeof body.contactId === "string" && typeof body.conversationId === "string") {
    const [contact, conversation] = await Promise.all([
      prisma.contact.findFirst({
        where: { id: body.contactId, workspaceId: ctx.workspaceId },
        select: { id: true },
      }),
      prisma.conversation.findFirst({
        where: { id: body.conversationId, workspaceId: ctx.workspaceId },
        select: { id: true },
      }),
    ]);
    if (contact && conversation) {
      toolCtx = { contactId: contact.id, conversationId: conversation.id };
    }
  }

  const aiConfig = await resolveAiConfig(ctx.workspaceId);
  const tools = skills.length > 0 ? toolsForSkills(skills) : undefined;
  const conversationMessages: ChatMessage[] = [...messages];

  let result = await generateWorkspaceReply(
    ctx.workspaceId,
    conversationMessages,
    systemPrompt,
    knowledge,
    aiConfig,
    1024,
    undefined,
    tools
  );
  if (result.quotaExceeded) {
    return NextResponse.json(
      { error: "تم بلوغ حد توكنات الذكاء الاصطناعي. رقِّ باقتك للمتابعة." },
      { status: 402 }
    );
  }

  // حلقة الأدوات — بنفس منطق المحرك، وتنفَّذ فعلياً عند توفر سياق صحيح
  const executedTools: { name: string; result: string }[] = [];
  for (let round = 0; result.reply?.toolCalls?.length && round < 2; round++) {
    const toolCalls = result.reply.toolCalls;
    if (!toolCtx) {
      // بلا سياق: نُظهر الاستدعاءات ونوقف الحلقة
      return NextResponse.json({
        reply:
          result.reply.content ||
          "طلب الوكيل تنفيذ إجراءات (لن يتم تنفيذها في وضع المعاينة)",
        toolCalls: toolCalls.map((c) => ({ name: c.name, argumentsJson: c.argumentsJson })),
        previewOnly: true,
      });
    }
    const toolResults = await runAgentTools(toolCalls, {
      workspaceId: ctx.workspaceId,
      ...toolCtx,
    });
    conversationMessages.push({ role: "assistant", content: result.reply.content, toolCalls });
    for (const r of toolResults) {
      const call = toolCalls.find((c) => c.id === r.toolCallId);
      executedTools.push({ name: call?.name ?? "", result: r.content });
      conversationMessages.push({
        role: "tool",
        toolCallId: r.toolCallId,
        name: call?.name ?? "",
        content: r.content,
      });
    }
    result = await generateWorkspaceReply(
      ctx.workspaceId,
      conversationMessages,
      systemPrompt,
      knowledge,
      aiConfig,
      1024,
      undefined,
      tools
    );
  }

  const reply = result.reply?.content?.trim() ? result.reply.content : null;
  return NextResponse.json({
    reply:
      reply ??
      "لا يمكن توليد رد حالياً — تأكد من إعداد مفتاح الذكاء الاصطناعي في صفحة الإعدادات",
    fallback: reply === null,
    ...(executedTools.length > 0 ? { executedTools } : {}),
  });
}
