import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// قائمة مفاتيح API لمساحة العمل — مالك مساحة العمل فقط
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json(
      { error: "إدارة مفاتيح API للمالك فقط" },
      { status: 403 }
    );
  }

  const keys = await prisma.apiKey.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ keys });
}

// إنشاء مفتاح جديد — يُعرض المفتاح الكامل مرة واحدة فقط في الاستجابة
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json(
      { error: "إدارة مفاتيح API للمالك فقط" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 60) {
    return NextResponse.json(
      { error: "اسم المفتاح مطلوب (من ١ إلى ٦٠ حرفاً)" },
      { status: 400 }
    );
  }

  const key = `fk_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 12); // مثال: fk_a1b2c3d4e5f6

  const apiKey = await prisma.apiKey.create({
    data: { workspaceId: ctx.workspaceId, name, keyHash, prefix },
  });

  return NextResponse.json(
    {
      key: {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        key, // المفتاح الكامل — لن يُعرض مرة أخرى
        createdAt: apiKey.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
