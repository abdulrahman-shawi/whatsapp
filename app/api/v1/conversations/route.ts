import { NextResponse } from "next/server";
import type { ConversationStatus } from "@prisma/client";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// قائمة المحادثات: ?status=&archived=&limit=
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json(
      { error: "مفتاح API غير صالح" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.trim();
  const archived = url.searchParams.get("archived");
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    500
  );

  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(status ? { status: status as ConversationStatus } : {}),
      ...(archived === "true"
        ? { isArchived: true }
        : archived === "false"
          ? { isArchived: false }
          : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      closedAt: true,
      lastMessageAt: true,
      createdAt: true,
      tags: true,
      contact: { select: { id: true, name: true, waPhone: true } },
      assignees: {
        select: { user: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      contact: c.contact,
      status: c.status,
      closedAt: c.closedAt?.toISOString() ?? null,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      tags: c.tags,
      assignees: c.assignees.map((a) => a.user),
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
