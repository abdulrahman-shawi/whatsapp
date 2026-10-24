import type { KnowledgeSource } from "@prisma/client";
import { runKnowledgeQuery } from "@/lib/db-knowledge";

// استرجاع بالكلمات المفتاحية مع تقسيم المصادر الطويلة:
// كل مصدر أطول من العتبة يُقسَّم إلى مقاطع (~1000 حرف عند حدود الأسطر) تُقيَّم كلٌّ على حدة،
// فيُحقن في البرومبت المقاطع الأقرب لسؤال العميل بدل نص الموقع كاملاً.

const CHUNK_THRESHOLD = 2000; // ما دون هذا الطول يُقيَّم مصدراً واحداً كاملاً
const CHUNK_SIZE = 1000;

type Chunk = { text: string; sourceTitle: string };

// تقسيم مصدر إلى مقاطع مع بقاء العنوان بادئة لكل مقطع
function chunkSource(source: KnowledgeSource): Chunk[] {
  if (source.content.length <= CHUNK_THRESHOLD) {
    return [{ text: `${source.title}\n${source.content}`, sourceTitle: source.title }];
  }
  const chunks: Chunk[] = [];
  let rest = source.content;
  while (rest.length > 0) {
    let slice = rest.slice(0, CHUNK_SIZE);
    if (rest.length > CHUNK_SIZE) {
      // نفضّل القطع عند نهاية سطر حتى لا تتشوه الجمل
      const lastBreak = slice.lastIndexOf("\n");
      if (lastBreak > CHUNK_SIZE * 0.5) slice = slice.slice(0, lastBreak);
    }
    chunks.push({ text: `${source.title}\n${slice.trim()}`, sourceTitle: source.title });
    rest = rest.slice(slice.length).replace(/^\s+/, "");
  }
  return chunks;
}

export function retrieveRelevantKnowledge(
  sources: KnowledgeSource[],
  query: string,
  top = 3
): string[] {
  if (sources.length === 0) return [];

  const queryTokens = new Set(tokenize(query));
  const chunks = sources.flatMap(chunkSource);

  const scored = chunks.map((chunk) => {
    let score = 0;
    for (const t of tokenize(chunk.text)) if (queryTokens.has(t)) score++;
    return { chunk, score };
  });

  // الأعلى تقاطعاً أولاً — وعند التعادل تبقى ترتيب المقاطع الأصلي ثابتاً
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
    .map((x) => x.chunk.text);
}

// جمع معرفة الوكيل الكاملة لرد على رسالة عميل محدد:
// نصوص وملفات ومواقع (بالاسترجاع المعتاد) + نتائج استعلامات قواعد البيانات الخارجية
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
