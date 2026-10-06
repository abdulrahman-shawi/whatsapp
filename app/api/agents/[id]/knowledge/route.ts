import { NextResponse } from "next/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { runKnowledgeQuery, validateDbQuery } from "@/lib/db-knowledge";

type Params = { params: { id: string } };

// التحقق من حقول مصدر قاعدة البيانات — يعيد البيانات أو رسالة خطأ
function validateDbSource(body: Record<string, unknown>):
  | { data: {
      title: string;
      dbEngine: "mysql" | "postgres";
      dbHost: string;
      dbPort?: number;
      dbName?: string;
      dbUser?: string;
      dbPassword?: string;
      dbQuery: string;
    } }
  | { error: string } {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const engine = body.dbEngine;
  const host = typeof body.dbHost === "string" ? body.dbHost.trim() : "";
  const query = typeof body.dbQuery === "string" ? body.dbQuery.trim() : "";
  if (!title) return { error: "عنوان المصدر مطلوب" };
  if (engine !== "mysql" && engine !== "postgres") {
    return { error: "المحرك يجب أن يكون mysql أو postgres" };
  }
  if (!host) return { error: "عنوان الخادم (host) مطلوب" };
  if (!query) return { error: "الاستعلام مطلوب" };
  const queryError = validateDbQuery(query);
  if (queryError) return { error: queryError };

  const port = Number(body.dbPort);
  return {
    data: {
      title,
      dbEngine: engine,
      dbHost: host,
      dbPort: Number.isFinite(port) && port > 0 ? port : undefined,
      dbName: typeof body.dbName === "string" && body.dbName.trim() ? body.dbName.trim() : undefined,
      dbUser: typeof body.dbUser === "string" && body.dbUser.trim() ? body.dbUser.trim() : undefined,
      dbPassword: typeof body.dbPassword === "string" && body.dbPassword ? body.dbPassword : undefined,
      dbQuery: query,
    },
  };
}

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
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

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

  // مصدر قاعدة بيانات خارجية (MySQL/Postgres)
  if (body?.type === "DB") {
    const fields = validateDbSource(body);
    if ("error" in fields) {
      return NextResponse.json({ error: fields.error }, { status: 400 });
    }
    const data = fields.data;

    // وضع الاختبار: ننفّذ الاستعلام برقم تجريبي ونعيد عينة من النتائج دون حفظ
    if (body.test === true) {
      const result = await runKnowledgeQuery(
        {
          dbEngine: data.dbEngine,
          dbHost: data.dbHost,
          dbPort: data.dbPort ?? null,
          dbName: data.dbName ?? null,
          dbUser: data.dbUser ?? null,
          dbPassword: data.dbPassword ?? null,
          dbQuery: data.dbQuery,
        },
        typeof body.testPhone === "string" && body.testPhone.trim()
          ? body.testPhone.trim()
          : "000000000000"
      );
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    const source = await prisma.knowledgeSource.create({
      data: {
        agentId: params.id,
        type: "DB",
        title: data.title,
        content: `استعلام ${data.dbEngine}: ${data.dbQuery.slice(0, 200)}`,
        dbEngine: data.dbEngine,
        dbHost: data.dbHost,
        dbPort: data.dbPort,
        dbName: data.dbName,
        dbUser: data.dbUser,
        dbPassword: data.dbPassword,
        dbQuery: data.dbQuery,
      },
    });
    // لا نعيد كلمات المرور للعميل أبداً
    const { dbPassword: _omit, ...safeSource } = source;
    return NextResponse.json({ source: safeSource }, { status: 201 });
  }

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
