import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// جهة اتصال واحدة مع معرفات محادثاتها الأخيرة
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

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
    select: {
      id: true,
      name: true,
      waPhone: true,
      stage: true,
      tags: true,
      notes: true,
      createdAt: true,
      conversations: {
        orderBy: { lastMessageAt: "desc" },
        take: 20,
        select: { id: true },
      },
    },
  });

  if (!contact) {
    return NextResponse.json(
      { error: "جهة الاتصال غير موجودة" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      waPhone: contact.waPhone,
      stage: contact.stage,
      tags: contact.tags,
      notes: contact.notes,
      createdAt: contact.createdAt.toISOString(),
      conversationIds: contact.conversations.map((c) => c.id),
    },
  });
}
