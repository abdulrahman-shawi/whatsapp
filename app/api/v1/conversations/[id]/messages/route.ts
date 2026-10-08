import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// رسائل محادثة واحدة: ?limit= (افتراضي 50، حد أقصى 200) — المحادثة ضمن مساحة المفتاح فقط
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json(
      { error: "مفتاح API غير صالح" },
      { status: 401 }
    );
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json(
      { error: "المحادثة غير موجودة" },
      { status: 404 }
    );
  }

  const limit = Math.min(
    Math.max(
      parseInt(new URL(req.url).searchParams.get("limit") ?? "50", 10) || 50,
      1
    ),
    200
  );

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      direction: true,
      senderType: true,
      body: true,
      isNote: true,
      mediaType: true,
      rating: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
