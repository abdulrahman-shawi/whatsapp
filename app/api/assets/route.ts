import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// حد الرفع العملي — قيود حجم طلب Vercel للباقة المجانية
const MAX_SIZE = 4 * 1024 * 1024;
const ALLOWED = /^image\/|^video\/|^audio\/|^application\/pdf$/;

// رفع وسائط لاستخدامها في خطوات سير العمل (SEND_MEDIA) — المالك فقط
// POST multipart/form-data بحقل "file" — يعيد { id, filename, mime }
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الرفع للمالك فقط" }, { status: 403 });
  }

  let file: File | null = null;
  let folder = "";
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
    const folderField = form.get("folder");
    if (typeof folderField === "string") folder = folderField.trim();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "حجم الملف يتجاوز 4MB — استخدم رابطاً مباشراً للملفات الأكبر" },
      { status: 400 }
    );
  }
  if (!ALLOWED.test(file.type)) {
    return NextResponse.json(
      { error: "الصيغ المدعومة: صور، فيديو، صوت، PDF" },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId: ctx.workspaceId,
      filename: file.name || "ملف",
      mime: file.type,
      folder,
      dataBase64: bytes.toString("base64"),
    },
  });
  return NextResponse.json(
    { id: asset.id, filename: asset.filename, mime: asset.mime, folder: asset.folder },
    { status: 201 }
  );
}

// قائمة وسائط المساحة (بلا بيانات الملفات) — مع فلترة ?folder= لاسم مجلد محدد
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const folder = new URL(req.url).searchParams.get("folder")?.trim() ?? "";
  const assets = await prisma.mediaAsset.findMany({
    where: { workspaceId: ctx.workspaceId, ...(folder ? { folder } : {}) },
    select: { id: true, filename: true, mime: true, folder: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    assets: assets.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  });
}
