import { NextResponse } from "next/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

// استخراج نص من ملف مرفوع حسب امتداده
async function extractText(
  fileName: string,
  buffer: Buffer
): Promise<{ text: string } | { error: string }> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const result = await pdfParse(buffer);
    return { text: result.text };
  }
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value };
  }
  if (ext === "doc") {
    return {
      error: "صيغة .doc القديمة غير مدعومة — احفظ الملف بصيغة .docx وأعد الرفع",
    };
  }
  return { error: "صيغة الملف غير مدعومة — المسموح: PDF أو Word" };
}

// إضافة مصدر معرفة: نص (JSON) أو ملف PDF/Word (multipart)
export async function POST(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  // رفع ملف: نستخرج النص ونخزنه — لا نخزن الملف نفسه حالياً
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractText(file.name, buffer);
      if ("error" in extracted) {
        return NextResponse.json({ error: extracted.error }, { status: 400 });
      }
      if (!extracted.text.trim()) {
        return NextResponse.json(
          { error: "تعذّر استخراج نص من الملف" },
          { status: 400 }
        );
      }

      const source = await prisma.knowledgeSource.create({
        data: {
          agentId: params.id,
          type: "FILE",
          title: file.name,
          content: extracted.text.trim(),
        },
      });
      return NextResponse.json({ source }, { status: 201 });
    } catch {
      return NextResponse.json(
        { error: "فشلت قراءة الملف — تأكد أنه غير تالف" },
        { status: 400 }
      );
    }
  }

  // مصدر نصي
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    typeof body.content !== "string" ||
    !body.content.trim()
  ) {
    return NextResponse.json(
      { error: "العنوان والمحتوى مطلوبان" },
      { status: 400 }
    );
  }

  const source = await prisma.knowledgeSource.create({
    data: {
      agentId: params.id,
      type: "TEXT",
      title: body.title.trim(),
      content: body.content.trim(),
    },
  });
  return NextResponse.json({ source }, { status: 201 });
}
