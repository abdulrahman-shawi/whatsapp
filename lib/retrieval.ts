import type { KnowledgeSource } from "@prisma/client";
import { runKnowledgeQuery } from "@/lib/db-knowledge";

// استرجاع بسيط بالكلمات المفتاحية: نقيس تقاطع كلمات نص العميل مع كل مصدر
// TODO: يمكن استبداله لاحقاً ببحث دلالي (embeddings) لدقة أعلى
export function retrieveRelevantKnowledge(
  sources: KnowledgeSource[],
  query: string,
  top = 3
): string[] {
  if (sources.length <= top) return sources.map((s) => s.content);

  const queryTokens = new Set(tokenize(query));
  const scored = sources.map((source) => {
    const sourceTokens = tokenize(`${source.title} ${source.content}`);
    let score = 0;
    for (const t of sourceTokens) if (queryTokens.has(t)) score++;
    return { source, score };
  });

  // نأخذ الأعلى تقاطعاً — ونُبقي المصادر العامة إن تعادلت النتائج
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
    .map((x) => x.source.content);
}

// جمع معرفة الوكيل الكاملة لرد على رسالة عميل محدد:
// نصوص وملفات (بالاسترجاع المعتاد) + نتائج استعلامات قواعد البيانات الخارجية
// المرتبطة برقم العميل — تُدمج جميعها في قائمة سياق واحدة للنموذج اللغوي
export async function collectAgentKnowledge(
  sources: KnowledgeSource[],
  query: string,
  waPhone: string
): Promise<string[]> {
  const staticSources = sources.filter((s) => s.type !== "DB");
  const dbSources = sources.filter((s) => s.type === "DB");

  const knowledge = retrieveRelevantKnowledge(staticSources, query);

  // تنفيذ استعلامات DB بشكل متوازٍ — أي فشل يُتجاهل حتى لا يعطّل الرد
  const dbResults = await Promise.all(
    dbSources.map(async (source) => {
      const result = await runKnowledgeQuery(source, waPhone);
      if (!result.ok) {
        console.warn(`[db-knowledge] مصدر "${source.title}" فشل: ${result.error}`);
        return null;
      }
      if (result.rowCount === 0) return null;
      return `${source.title}:\n${result.text}`;
    })
  );

  return [...knowledge, ...dbResults.filter((r): r is string => r !== null)];
}

// تقسيم النص إلى كلمات (يدعم العربية عبر خصائص Unicode)
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}
