import * as cheerio from "cheerio";

// سحب محتوى المواقع كمصدر معرفة للوكيل:
// نزحف الصفحة المحددة ثم روابط نفس النطاق الداخلية (حد أقصى) ونستخرج النصوص فقط.
// الزحف للصفحات الثابتة — لا ننفّذ JavaScript.

export type CrawledPage = { url: string; title: string; text: string };

export type FetchResult = { ok: true; html: string } | { ok: false; error: string };
export type Fetcher = (url: string) => Promise<FetchResult>;

export type CrawlOptions = {
  maxPages?: number; // حد أقصى لعدد الصفحات (الافتراضي 10)
  maxTotalChars?: number; // حد أقصى لإجمالي الأحرف المسحوبة (الافتراضي 300 ألف)
  fetcher?: Fetcher; // حقن دالة الجلب للاختبارات
};

export type CrawlResult =
  | { ok: true; pages: CrawledPage[]; chars: number }
  | { ok: false; error: string };

const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_TOTAL_CHARS = 300_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2MB لكل صفحة
const FETCH_TIMEOUT_MS = 10_000;
// امتدادات لا نتبع روابطها أثناء الزحف
const NON_PAGE_EXT = /\.(pdf|png|jpe?g|gif|webp|svg|ico|css|js|mjs|map|zip|rar|7z|mp[34]|webm|mov|avi|woff2?|ttf|eot|txt|xml|json)(\?|#|$)/i;

// مضيفون ممنوع سحبهم حمايةً من SSRF (شبكات خاصة/محلية)
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "0.0.0.0" || h === "::1" || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

// تطبيع الرابط والتحقق من صلاحيته — يعيد null عند رفضه
export function normalizeUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (isPrivateHost(url.hostname)) return null;
  return url;
}

// دالة الجلب الافتراضية عبر fetch مع مهلة وسقف حجم
async function defaultFetcher(url: string): Promise<FetchResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; WhatsAppAgentBot/1.0; +knowledge-crawler)",
          accept: "text/html,application/xhtml+xml",
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { ok: false, error: `نوع المحتوى غير مدعوم: ${contentType.split(";")[0]}` };
    }
    const lengthHeader = Number(res.headers.get("content-length") ?? 0);
    if (lengthHeader > MAX_HTML_BYTES) {
      return { ok: false, error: "حجم الصفحة يتجاوز الحد المسموح (2MB)" };
    }
    let html = await res.text();
    if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES);
    return { ok: true, html };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes("abort") ? "انتهت مهلة الاتصال" : msg };
  }
}

// استخراج العنوان والنص من HTML مع استبعاد العناصر غير المفيدة
export function extractPageText(html: string, pageUrl: string): CrawledPage & { links: string[] } {
  const $ = cheerio.load(html);
  $("script, style, noscript, template, nav, header, footer, aside, form, iframe, svg").remove();

  const title =
    ($("title").first().text().trim() || $("h1").first().text().trim() || pageUrl).slice(0, 200);

  // فواصل أسطر حول عناصر كتلة حتى لا يلتصق النص ببعضه
  const text = (
    $("main").length > 0
      ? $("main").text()
      : $("body").length > 0
        ? $("body").text()
        : $.root().text()
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, pageUrl);
      abs.hash = "";
      if (abs.protocol === "http:" || abs.protocol === "https:") {
        links.push(abs.toString());
      }
    } catch {
      // روابط malformed تُتجاهل
    }
  });

  return { url: pageUrl, title, text, links };
}

// زحف موقع ابتداءً من رابط: BFS على نفس النطاق حتى حد الصفحات/الأحرف
export async function crawlWebsite(startUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const start = normalizeUrl(startUrl);
  if (!start) {
    return { ok: false, error: "الرابط غير صالح — يجب أن يبدأ بـ http:// أو https://" };
  }
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
  const fetcher = options.fetcher ?? defaultFetcher;

  const origin = start.origin;
  const visited = new Set<string>();
  const queue: string[] = [start.toString()];
  const pages: CrawledPage[] = [];
  let totalChars = 0;
  let firstError: string | null = null;

  while (queue.length > 0 && pages.length < maxPages && totalChars < maxTotalChars) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    const fetched = await fetcher(url);
    if (!fetched.ok) {
      if (firstError === null) firstError = fetched.error;
      continue; // صفحة فاشلة لا توقف الزحف — عدا الصفحة الأولى تُفحص لاحقاً
    }

    let extracted: ReturnType<typeof extractPageText>;
    try {
      extracted = extractPageText(fetched.html, url);
    } catch {
      if (firstError === null) firstError = "تعذّر تحليل الصفحة";
      continue;
    }

    // نتجاهل الصفحات شبه الفارغة (قوائم روابط بلا محتوى)
    if (extracted.text.length >= 200) {
      pages.push({ url: extracted.url, title: extracted.title, text: extracted.text });
      totalChars += extracted.text.length;
    }

    // أضف روابط نفس النطاق غير المزارة
    for (const link of extracted.links) {
      if (pages.length + queue.length >= maxPages) break;
      if (NON_PAGE_EXT.test(link)) continue;
      let parsed: URL;
      try {
        parsed = new URL(link);
      } catch {
        continue;
      }
      if (parsed.origin !== origin) continue;
      const normalized = parsed.toString();
      if (!visited.has(normalized) && !queue.includes(normalized)) {
        queue.push(normalized);
      }
    }
  }

  if (pages.length === 0) {
    return {
      ok: false,
      error: firstError ? `تعذّر سحب أي صفحة (${firstError})` : "تعذّر سحب أي صفحة من الموقع",
    };
  }
  return { ok: true, pages, chars: totalChars };
}

// تنسيق صفحات مسحوبة كنص معرفة واحد يُخزَّن في مصدر المعرفة
export function formatKnowledge(pages: CrawledPage[]): string {
  return pages
    .map((p) => `[الصفحة: ${p.title} — ${p.url}]\n${p.text}`)
    .join("\n\n---\n\n")
    .trim();
}
