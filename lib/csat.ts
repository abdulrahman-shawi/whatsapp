export function parseCsatRating(text: string): number | null {
  const normalized = text
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  const match = /^\s*([1-5])\s*$/.exec(normalized);
  return match ? Number(match[1]) : null;
}
