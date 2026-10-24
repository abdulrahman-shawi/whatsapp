import { describe, expect, it } from "vitest";
import {
  crawlWebsite,
  extractPageText,
  formatKnowledge,
  normalizeUrl,
  type Fetcher,
} from "@/lib/web-knowledge";

const page = (title: string, body: string, links: string[] = []) => `<!doctype html>
<html><head><title>${title}</title></head><body>
<nav><a href="/ignore-me">قائمة</a></nav>
${body}
${links.map((l) => `<a href="${l}">رابط</a>`).join("\n")}
<script>var x = 1;</script>
<style>.a{color:red}</style>
</body></html>`;

function siteFetcher(pages: Record<string, string>): Fetcher {
  return async (url) => {
    const html = pages[url];
    if (!html) return { ok: false, error: "HTTP 404" };
    return { ok: true, html };
  };
}

describe("normalizeUrl", () => {
  it("accepts http/https urls and strips hash", () => {
    const url = normalizeUrl("https://Example.com/pricing#section");
    expect(url?.toString()).toBe("https://example.com/pricing");
  });

  it("rejects non-http schemes and malformed urls", () => {
    expect(normalizeUrl("ftp://example.com")).toBeNull();
    expect(normalizeUrl("example.com")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });

  it("blocks private hosts (SSRF guard)", () => {
    expect(normalizeUrl("http://localhost/admin")).toBeNull();
    expect(normalizeUrl("http://127.0.0.1/x")).toBeNull();
    expect(normalizeUrl("http://10.0.0.5/x")).toBeNull();
    expect(normalizeUrl("http://192.168.1.1/x")).toBeNull();
    expect(normalizeUrl("http://172.16.0.1/x")).toBeNull();
    expect(normalizeUrl("http://172.32.0.1/x")?.hostname).toBe("172.32.0.1");
  });
});

describe("extractPageText", () => {
  it("removes scripts, styles and nav and keeps readable text", () => {
    const html = page("الأسعار", "<main><h1>قائمة الأسعار</h1><p>اشتراك شهري ٩٩ ريال</p></main>");
    const { title, text } = extractPageText(html, "https://example.com/pricing");
    expect(title).toBe("الأسعار");
    expect(text).toContain("قائمة الأسعار");
    expect(text).toContain("اشتراك شهري ٩٩ ريال");
    expect(text).not.toContain("var x");
    expect(text).not.toContain("color:red");
  });

  it("resolves relative links against the page url", () => {
    const html = page("رئيسية", "<p>محتوى كافٍ هنا لتجاوز الحد الأدنى للنص المطلوب للصفحة</p>", [
      "/pricing",
      "https://other.com/x",
    ]);
    const { links } = extractPageText(html, "https://example.com/");
    expect(links).toContain("https://example.com/pricing");
    // الروابط الخارجية تُجمع هنا وتُرشّح لاحقاً في crawlWebsite بنفس النطاق
    expect(links).toContain("https://other.com/x");
  });
});

describe("crawlWebsite", () => {
  it("crawls same-origin pages up to maxPages and formats knowledge", async () => {
    const home = page(
      "الرئيسية",
      "<p>" + "منتجاتنا تشمل القهوة المختصة والشاي ".repeat(20) + "</p>",
      ["/a", "/b", "/c"]
    );
    const a = page("صفحة أ", "<p>" + "تفاصيل القهوة المختصة ومصادرها ".repeat(20) + "</p>");
    const b = page("صفحة ب", "<p>" + "تفاصيل الشاي والأعشاب الطبيعية ".repeat(20) + "</p>", ["/c"]);
    const c = page("صفحة ج", "<p>" + "أسئلة شائعة عن الشحن والتوصيل ".repeat(20) + "</p>");

    const result = await crawlWebsite("https://example.com/", {
      maxPages: 10,
      fetcher: siteFetcher({
        "https://example.com/": home,
        "https://example.com/a": a,
        "https://example.com/b": b,
        "https://example.com/c": c,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages.length).toBe(4);
    expect(result.chars).toBeGreaterThan(800);

    const knowledge = formatKnowledge(result.pages);
    expect(knowledge).toContain("[الصفحة: الرئيسية — https://example.com/]");
    expect(knowledge).toContain("---");
    expect(knowledge).toContain("القهوة المختصة");
  });

  it("respects maxPages limit", async () => {
    const home = page(
      "الرئيسية",
      "<p>" + "محتوى رئيسي متكرر لهذه الصفحة الرئيسية ".repeat(20) + "</p>",
      ["/a", "/b"]
    );
    const a = page("صفحة أ", "<p>" + "محتوى الصفحة الأولى المعروضة هنا ".repeat(20) + "</p>");
    const b = page("صفحة ب", "<p>" + "محتوى الصفحة الثانية المعروضة هنا ".repeat(20) + "</p>");

    const result = await crawlWebsite("https://example.com/", {
      maxPages: 2,
      fetcher: siteFetcher({
        "https://example.com/": home,
        "https://example.com/a": a,
        "https://example.com/b": b,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages.length).toBe(2);
  });

  it("skips non-page file links and external origins", async () => {
    const home = page(
      "الرئيسية",
      "<p>" + "محتوى كافٍ لهذه الصفحة لتجاوز الحد الأدنى المطلوب نعم ".repeat(15) + "</p>",
      ["/catalog.pdf", "https://external.com/x", "/real"]
    );
    const real = page("صفحة حقيقية", "<p>" + "محتوى الصفحة الحقيقية القابلة للمتابعة ".repeat(20) + "</p>");

    const result = await crawlWebsite("https://example.com/", {
      fetcher: siteFetcher({
        "https://example.com/": home,
        "https://example.com/real": real,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages.map((p) => p.url)).toEqual([
      "https://example.com/",
      "https://example.com/real",
    ]);
  });

  it("fails when no page could be fetched", async () => {
    const result = await crawlWebsite("https://example.com/", {
      fetcher: siteFetcher({}),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("تعذّر");
  });

  it("continues past a failing page and still returns the rest", async () => {
    const home = page(
      "الرئيسية",
      "<p>" + "محتوى رئيسي مع الروابط للصفحات الداخلية المختلفة ".repeat(20) + "</p>",
      ["/broken", "/ok"]
    );
    const ok = page("صالحة", "<p>" + "هذه صفحة صالحة تم سحبها بنجاح بعد فشل أخرى ".repeat(20) + "</p>");

    const fetcher: Fetcher = async (url) => {
      if (url === "https://example.com/broken") return { ok: false, error: "HTTP 500" };
      const html = url === "https://example.com/" ? home : ok;
      return { ok: true, html };
    };

    const result = await crawlWebsite("https://example.com/", { fetcher });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages.map((p) => p.url)).toEqual([
      "https://example.com/",
      "https://example.com/ok",
    ]);
  });
});
