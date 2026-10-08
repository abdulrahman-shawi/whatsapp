import { NextResponse } from "next/server";
import type { ContactStage } from "@prisma/client";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// قائمة جهات الاتصال: ?q=&stage=&limit= (افتراضي 100، حد أقصى 500)
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json(
      { error: "مفتاح API غير صالح" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const stage = url.searchParams.get("stage")?.trim();
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    500
  );

  const contacts = await prisma.contact.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(stage ? { stage: stage as ContactStage } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { waPhone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      waPhone: true,
      stage: true,
      tags: true,
      notes: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    contacts: contacts.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
  });
}
