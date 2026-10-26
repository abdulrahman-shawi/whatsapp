import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStaffRestrictionFilter } from "@/lib/conversations";
import { resolveAiConfig } from "@/lib/openai";
import { generateWorkspaceReply } from "@/lib/billing/ai-usage";
import { workspaceIsReadOnly } from "@/lib/billing/workspace-access";

const translationAttempts = new Map<string, { startedAt: number; count: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_COUNT = 12;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const now = Date.now();
  const attempts = translationAttempts.get(ctx.userId);
  if (attempts && now - attempts.startedAt < RATE_LIMIT_WINDOW_MS) {
    if (attempts.count >= RATE_LIMIT_COUNT) {
      return NextResponse.json(
        { error: "تجاوزت حد طلبات الترجمة. حاول بعد دقيقة." },
        { status: 429 }
      );
    }
    attempts.count += 1;
  } else {
    translationAttempts.set(ctx.userId, { startedAt: now, count: 1 });
    for (const [userId, entry] of translationAttempts) {
      if (now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) {
        translationAttempts.delete(userId);
      }
    }
  }

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.text !== "string" ||
    !body.text.trim() ||
    body.text.length > 4000 ||
    (body.direction !== "toArabic" && body.direction !== "toCustomer")
  ) {
    return NextResponse.json({ error: "بيانات الترجمة غير صالحة" }, { status: 400 });
  }

  const restrictToUserId = await getStaffRestrictionFilter(
    ctx.workspaceId,
    ctx.role,
    ctx.userId
  );
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: params.id,
      workspaceId: ctx.workspaceId,
      ...(restrictToUserId
        ? { assignees: { some: { userId: restrictToUserId } } }
        : {}),
    },
    include: {
      messages: {
        where: { direction: "INBOUND" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true },
      },
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
  if (body.direction === "toCustomer" && !conversation.messages[0]) {
    return NextResponse.json(
      { error: "لا توجد رسالة من العميل لتحديد لغة الترجمة" },
      { status: 400 }
    );
  }

  const instruction =
    body.direction === "toArabic"
      ? "Translate the user's message into natural Arabic. Return only the translation, without explanation."
      : `Translate the staff reply into the same language as the customer's latest message below. Preserve meaning and tone. Return only the translation, without explanation.\n\nCustomer's latest message:\n${conversation.messages[0]?.body.slice(0, 1000) ?? ""}`;
  const result = await generateWorkspaceReply(
    ctx.workspaceId,
    [{ role: "user", content: body.text.trim() }],
    instruction,
    [],
    await resolveAiConfig(),
    1024
  );
  if (result.quotaExceeded) {
    return NextResponse.json(
      { error: "تم بلوغ حد توكنات الذكاء الاصطناعي. رقِّ باقتك للمتابعة." },
      { status: 402 }
    );
  }
  if (!result.reply?.content.trim()) {
    return NextResponse.json(
      { error: "تعذرت الترجمة. تحقق من إعدادات مزود الذكاء الاصطناعي." },
      { status: 502 }
    );
  }
  return NextResponse.json({ translation: result.reply.content.trim() });
}
