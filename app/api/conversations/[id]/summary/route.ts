import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveAiConfig } from "@/lib/openai";
import { generateWorkspaceReply } from "@/lib/billing/ai-usage";
import { workspaceIsReadOnly } from "@/lib/billing/workspace-access";

// تلخيص محادثة طويلة بالذكاء الاصطناعي — للموظف الجديد الذي يتسلم المحادثة
// يحفظ النتيجة على المحادثة ويعيدها؛ ‎?force=true يتجاوز التلخيص المخزن (أقدم من ١٠ دقائق)
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    include: {
      contact: { select: { name: true, waPhone: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 80 },
    },
  });
  if (!conversation) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }
  if (await workspaceIsReadOnly(ctx.workspaceId)) {
    return NextResponse.json(
      { error: "انتهت التجربة المجانية؛ الترقية مطلوبة لاستخدام الذكاء الاصطناعي." },
      { status: 402 }
    );
  }

  const force = new URL(req.url).searchParams.get("force") === "true";
  const fresh =
    conversation.summarizedAt &&
    Date.now() - conversation.summarizedAt.getTime() < 10 * 60 * 1000;
  if (conversation.summary && fresh && !force) {
    return NextResponse.json({ summary: conversation.summary, cached: true });
  }
  if (conversation.messages.length === 0) {
    return NextResponse.json({ error: "لا رسائل لتلخيصها" }, { status: 400 });
  }

  const transcript = conversation.messages
    .map((m) =>
      `${m.direction === "INBOUND" ? "العميل" : "الفريق/الذكاء"}: ${m.body}`
    )
    .join("\n");

  const config = await resolveAiConfig(ctx.workspaceId);
  const result = await generateWorkspaceReply(
    ctx.workspaceId,
    [
      {
        role: "user",
        content: `لخّص هذه المحادثة مع العميل "${conversation.contact.name ?? conversation.contact.waPhone}" في ٥ أسطر كحد أقصى:\n${transcript}`,
      },
    ],
    "أنت مساعد يلخص محادثات خدمة عملاء للموظف الذي سيتسلمها. استخدم النقاط المختصرة: طلب العميل، ما تم الاتفاق عليه، مواعيد أو مبالغ ذُكرت، وما تبقّى مطلوباً من الفريق.",
    [],
    config
  );
  if (result.quotaExceeded) {
    return NextResponse.json(
      { error: "تم بلوغ حد توكنات الذكاء الاصطناعي. رقِّ باقتك للمتابعة." },
      { status: 402 }
    );
  }
  const reply = result.reply;
  if (!reply) {
    return NextResponse.json(
      { error: "تعذّر التلخيص — تحقق من مفتاح الذكاء الاصطناعي في الإعدادات" },
      { status: 502 }
    );
  }

  await prisma.conversation.update({
    where: { id: params.id },
    data: { summary: reply.content, summarizedAt: new Date() },
  });
  return NextResponse.json({ summary: reply.content, cached: false });
}
