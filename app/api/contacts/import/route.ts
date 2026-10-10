import { NextResponse } from "next/server";
import type { ContactStage } from "@prisma/client";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isContactStage } from "@/lib/contact-stages";
import { recordStageChange } from "@/lib/stage-history";
import { recalculateLeadScore } from "@/lib/scoring";

// استيراد عملاء من ملف CSV (multipart form-data، الحقل "file")
// الأعمدة المتوقعة في السطر الأول: name, phone (مطلوب), tags, notes, stage
// تُقبل الترويسات العربية أيضاً: الاسم، الرقم/الجوال، الوسوم، الملاحظات، المرحلة
// الوسوم تُفصل بـ ; أو | أو ؛ — كل صف غير صالح يُتخطّى ويُذكر في الأخطاء (بحد أقصى 20)
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  let file: File | null = null;
  try {
    const formData = await req.formData();
    const entry = formData.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    file = null;
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "لم يُرفق ملف CSV" }, { status: 400 });
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return NextResponse.json({ error: "تعذّرت قراءة الملف" }, { status: 400 });
  }
  // إزالة BOM ترميز UTF-8 الذي تضيفه Excel
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = parseCsv(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: "الملف فارغ أو بلا صفوف بيانات" }, { status: 400 });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const idxName = col(["name", "الاسم"]);
  const idxPhone = col(["phone", "رقم", "الرقم", "جوال", "الجوال"]);
  const idxTags = col(["tags", "وسوم", "الوسوم"]);
  const idxNotes = col(["notes", "ملاحظات", "الملاحظات"]);
  const idxStage = col(["stage", "مرحلة", "المرحلة"]);
  if (idxPhone < 0) {
    return NextResponse.json(
      { error: "عمود الرقم (phone) مطلوب في السطر الأول" },
      { status: 400 }
    );
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  const skip = (lineNo: number, reason: string) => {
    skipped++;
    if (errors.length < 20) errors.push(`سطر ${lineNo}: ${reason}`);
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // تجاهل الأسطر الفارغة تماماً
    if (row.every((cell) => !cell.trim())) continue;
    const lineNo = i + 1;

    try {
      const phone = normalizePhone(row[idxPhone] ?? "");
      if (!phone) {
        skip(lineNo, "رقم الجوال فارغ أو غير صالح");
        continue;
      }

      const stageRaw = idxStage >= 0 ? row[idxStage].trim() : "";
      let stage: ContactStage | undefined;
      if (stageRaw) {
        if (!isContactStage(stageRaw)) {
          skip(lineNo, `المرحلة "${stageRaw}" غير معروفة`);
          continue;
        }
        stage = stageRaw as ContactStage;
      }

      const name = idxName >= 0 ? row[idxName].trim() || null : null;
      const notes = idxNotes >= 0 ? row[idxNotes].trim() || null : null;
      const tags =
        idxTags >= 0
          ? row[idxTags]
              .split(/[;|؛]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : [];

      const existing = await prisma.contact.findUnique({
        where: {
          workspaceId_waPhone: { workspaceId: ctx.workspaceId, waPhone: phone },
        },
        select: { id: true, name: true, stage: true },
      });

      const data = {
        // لا نستبدل اسماً محفوظاً يدوياً — نملأ الفراغ فقط
        ...(name && !existing?.name ? { name } : {}),
        ...(notes ? { notes } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      };

      const contact = existing
        ? await prisma.contact.update({ where: { id: existing.id }, data })
        : await prisma.contact.create({
            data: {
              workspaceId: ctx.workspaceId,
              waPhone: phone,
              name,
              notes,
              tags,
            },
          });

      if (existing) updated++;
      else imported++;

      if (stage && contact.stage !== stage) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { stage },
        });
        await recordStageChange(contact.id, stage, "manual");
        void recalculateLeadScore(contact.id);
      } else {
        void recalculateLeadScore(contact.id);
      }
    } catch (e) {
      skip(
        lineNo,
        e instanceof Error ? e.message.slice(0, 120) : "خطأ غير معروف"
      );
    }
  }

  return NextResponse.json({ imported, updated, skipped, errors });
}

// إزالة كل ما ليس رقماً ثم إزالة بادئة 00 الدولية — نفس منطق نماذج العملاء
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^00/, "");
}

// محلل CSV بسيط: يدعم الفواصل، الحقول المُقتبسة بـ ""، وأسطر CRLF
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
