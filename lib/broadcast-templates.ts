export function getTemplateVariableIndexes(body: string): number[] {
  return [
    ...new Set(
      [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]))
    ),
  ].sort((a, b) => a - b);
}

export function validateTemplateParams(
  body: string,
  params: string[]
): string | null {
  const indexes = getTemplateVariableIndexes(body);
  const expectedCount = indexes.at(-1) ?? 0;
  if (indexes.some((index, position) => index !== position + 1)) {
    return "ترقيم متغيرات القالب غير متسلسل — راجع معاينة القالب في الإعدادات";
  }
  if (params.length !== expectedCount || params.some((param) => !param.trim())) {
    if (expectedCount === 0) {
      return "القالب لا يحتوي متغيرات — أزل القيم الإضافية";
    }
    return `أدخل قيمة غير فارغة لكل متغير من {{1}} إلى {{${expectedCount}}}`;
  }
  return null;
}
