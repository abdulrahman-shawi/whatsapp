import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

// عرض ملف مرفوع — لأعضاء مساحة العمل المالكة (معاينة في المنشئ)
export async function GET(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!asset) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const bytes = Buffer.from(asset.dataBase64, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// نقل ملف لمجلد آخر (أو إخراجه من مجلد بقيمة فارغة) — المالك فقط
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.folder !== "string") {
    return NextResponse.json({ error: "المجلد غير صالح" }, { status: 400 });
  }

  const existing = await prisma.mediaAsset.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const asset = await prisma.mediaAsset.update({
    where: { id: params.id },
    data: { folder: body.folder.trim() },
    select: { id: true, filename: true, mime: true, folder: true },
  });
  return NextResponse.json({ asset });
}
