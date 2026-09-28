// أدوات تنسيق الوقت بالعربية

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// تحويل الأرقام إلى أرقام عربية مشرقية (٥ بدل 5)
function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

// صيغة الجمع العربية: مفرد/مثنى/قليل/كثير
function formatCount(
  count: number,
  forms: { one: string; two: string; few: string; many: string }
): string {
  if (count === 1) return `قبل ${forms.one}`;
  if (count === 2) return `قبل ${forms.two}`;
  if (count <= 10) return `قبل ${toArabicDigits(count)} ${forms.few}`;
  return `قبل ${toArabicDigits(count)} ${forms.many}`;
}

// وقت نسبي مثل: الآن، قبل ٥ دقائق، قبل ساعتين
export function relativeTime(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "الآن";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return formatCount(minutes, {
      one: "دقيقة",
      two: "دقيقتين",
      few: "دقائق",
      many: "دقيقة",
    });

  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return formatCount(hours, {
      one: "ساعة",
      two: "ساعتين",
      few: "ساعات",
      many: "ساعة",
    });

  const days = Math.floor(hours / 24);
  if (days < 30)
    return formatCount(days, {
      one: "يوم",
      two: "يومين",
      few: "أيام",
      many: "يوماً",
    });

  return new Date(date).toLocaleDateString("ar");
}

// توقيت الرسالة: الساعة والدقيقة فقط
export function messageTime(date: string | Date): string {
  return new Intl.DateTimeFormat("ar", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
