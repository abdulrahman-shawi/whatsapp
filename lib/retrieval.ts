import type { KnowledgeSource } from "@prisma/client";

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

// تقسيم النص إلى كلمات (يدعم العربية عبر خصائص Unicode)
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}
