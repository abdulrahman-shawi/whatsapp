import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// معلومات المفتاح الحالي وجهة مساحة العمل المرتبطة به
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json(
      { error: "مفتاح API غير صالح" },
      { status: 401 }
    );
  }

  const [apiKey, workspace] = await Promise.all([
    prisma.apiKey.findUnique({
      where: { id: auth.apiKeyId },
      select: { name: true, prefix: true, scopes: true, createdAt: true },
    }),
    prisma.workspace.findUnique({
      where: { id: auth.workspaceId },
      select: { name: true },
    }),
  ]);

  return NextResponse.json({
    key: {
      name: apiKey?.name ?? null,
      prefix: apiKey?.prefix ?? null,
      scopes: apiKey?.scopes ?? [],
      createdAt: apiKey?.createdAt.toISOString() ?? null,
    },
    workspace: { id: auth.workspaceId, name: workspace?.name ?? null },
  });
}
