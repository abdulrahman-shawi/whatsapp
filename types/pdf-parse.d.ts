// تعريف محلي لاستيراد pdf-parse من الملف الداخلي
// (نستورد lib/pdf-parse.js بدل نقطة الدخول لتفادي وضع التصحيح في الحزمة)
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    text: string;
  }
  function pdfParse(
    data: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;
  export default pdfParse;
}
