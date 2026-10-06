import mysql from "mysql2/promise";
import { Client } from "pg";
import type { KnowledgeSource } from "@prisma/client";

// تنفيذ استعلامات قراءة فقط من قواعد بيانات العملاء (MySQL/Postgres)
// لاستخدامها كمصدر معرفة للوكيل الذكي — تُدمج نتائجها مع النصوص والملفات
//
// ضوابط الأمان:
// - استعلامات SELECT فقط (أي شيء آخر يُرفض قبل التنفيذ)
// - قيمة {{phone}} تُمرَّر معاملياً — لا حقن نصي
// - حد أقصى ٢٠ صفاً ومهلة ٨ ثوانٍ لكل استعلام
// - الاتصال يُغلق فور الانتهاء — لا مجمع اتصالات مفتوح

const MAX_ROWS = 20;
const QUERY_TIMEOUT_MS = 8000;
const MAX_RESULT_CHARS = 3000;

export type DbQueryResult =
  | { ok: true; text: string; rowCount: number }
  | { ok: false; error: string };

// فحص الاستعلام: قراءة فقط + استخراج المعاملات النائبة
// نسمح فقط بعبارة SELECT واحدة (مع WITH للاستعلامات الفرعية)
export function validateDbQuery(query: string): string | null {
  const cleaned = query
    .replace(/--[^\n]*/g, " ") // إزالة التعليقات السطرية
    .replace(/\/\*[\s\S]*?\*\//g, " ") // إزالة التعليقات المتعددة الأسطر
    .trim();
  if (!/^(select|with)\b/i.test(cleaned)) {
    return "مسموح باستعلامات القراءة (SELECT) فقط";
  }
  if (/;/.test(cleaned.replace(/;$/, ""))) {
    return "يُسمح بعبارة واحدة فقط — لا تستخدم الفاصلة المنقوطة";
  }
  return null;
}

// تحويل قالب الاستعلام إلى نص + قيم معاملات مرتبة
// العنصر النائب الوحيد المدعوم: {{phone}} (رقم العميل الحالي)
function buildQuery(
  template: string,
  phone: string,
  placeholder: string
): { sql: string; values: string[] } {
  const values: string[] = [];
  const sql = template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    if (name === "phone") {
      values.push(phone);
      return placeholder;
    }
    return _match; // عناصر نائبة غير معروفة تُترك كما هي (لن تطابق شيئاً)
  });
  return { sql, values };
}

// ضمان سقف عدد الصفوف: نضيف LIMIT إن لم يوجد
function capRows(sql: string): string {
  if (/\blimit\s+\d+/i.test(sql)) return sql;
  return `${sql} LIMIT ${MAX_ROWS}`;
}

// تنسيق الصفوف كنص مضغوط يفهمه النموذج اللغوي
function formatRows(rows: Record<string, unknown>[]): string {
  const lines = rows.map((row) =>
    Object.entries(row)
      .map(([key, value]) => `${key}: ${String(value ?? "—")}`)
      .join(" | ")
  );
  const text = lines.join("\n");
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}…`
    : text;
}

// تنفيذ استعلام مصدر معرفة DB وإرجاع نتيجة منسَّقة كنص
export async function runKnowledgeQuery(
  source: Pick<
    KnowledgeSource,
    | "dbEngine"
    | "dbHost"
    | "dbPort"
    | "dbName"
    | "dbUser"
    | "dbPassword"
    | "dbQuery"
  >,
  phone: string
): Promise<DbQueryResult> {
  if (!source.dbEngine || !source.dbHost || !source.dbQuery) {
    return { ok: false, error: "بيانات الاتصال غير مكتملة" };
  }
  const invalid = validateDbQuery(source.dbQuery);
  if (invalid) return { ok: false, error: invalid };

  try {
    if (source.dbEngine === "mysql") {
      const { sql, values } = buildQuery(source.dbQuery, phone, "?");
      const connection = await mysql.createConnection({
        host: source.dbHost,
        port: source.dbPort ?? 3306,
        user: source.dbUser ?? undefined,
        password: source.dbPassword ?? undefined,
        database: source.dbName ?? undefined,
        connectTimeout: QUERY_TIMEOUT_MS,
      });
      try {
        const [rows] = await connection.query({
          sql: capRows(sql),
          values,
          timeout: QUERY_TIMEOUT_MS,
        });
        const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
        if (list.length === 0) return { ok: true, text: "", rowCount: 0 };
        return { ok: true, text: formatRows(list.slice(0, MAX_ROWS)), rowCount: list.length };
      } finally {
        await connection.end().catch(() => {});
      }
    }

    if (source.dbEngine === "postgres") {
      const { sql, values } = buildQuery(source.dbQuery, phone, "$1");
      const client = new Client({
        host: source.dbHost,
        port: source.dbPort ?? 5432,
        user: source.dbUser ?? undefined,
        password: source.dbPassword ?? undefined,
        database: source.dbName ?? undefined,
        connectionTimeoutMillis: QUERY_TIMEOUT_MS,
        statement_timeout: QUERY_TIMEOUT_MS,
      });
      await client.connect();
      try {
        const result = await client.query(capRows(sql), values);
        if (result.rows.length === 0) return { ok: true, text: "", rowCount: 0 };
        return {
          ok: true,
          text: formatRows(result.rows.slice(0, MAX_ROWS) as Record<string, unknown>[]),
          rowCount: result.rows.length,
        };
      } finally {
        await client.end().catch(() => {});
      }
    }

    return { ok: false, error: `محرك غير مدعوم: ${source.dbEngine}` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "خطأ غير معروف";
    return { ok: false, error: `تعذّر الاتصال أو التنفيذ: ${message.slice(0, 200)}` };
  }
}
