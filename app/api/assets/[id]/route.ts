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
