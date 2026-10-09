import { prisma } from "@/lib/prisma";

// مفتاح إعداد لون العلامة في جدول Setting — لكل مساحة عمل صف واحد بمفتاح "theme"
export const THEME_KEY = "theme";
// اللون الافتراضي — نفس بنفسج globals.css عند غياب الإعداد
export const DEFAULT_THEME_COLOR = "#7c3aed";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// تحقق من صيغة hex: #rgb أو #rrggbb
export function isValidHexColor(color: string): boolean {
  return HEX_RE.test(color.trim());
}

// تحويل hex إلى HSL بصيغة "h s% l%" المتوافقة مع متغيرات CSS
export function hexToHsl(color: string): { h: number; s: number; l: number } | null {
  const match = HEX_RE.exec(color.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// لون النص فوق اللون الأساسي: أسود للألوان الفاتحة وأبيض للداكنة (حسب السطوع)
function foregroundFor({ h, s, l }: { h: number; s: number; l: number }): string {
  if (l >= 62) return "224 71% 4%";
  return "210 20% 98%";
}

// قراءة لون العلامة لمساحة عمل — يعيد اللون hex أو الافتراضي
export async function getWorkspaceThemeColor(workspaceId: string): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { workspaceId_key: { workspaceId, key: THEME_KEY } },
  });
  const color = row?.value?.trim();
  return color && isValidHexColor(color) ? color : DEFAULT_THEME_COLOR;
}

// متغيرات CSS الجاهزة للحقن كـ inline style على جذر لوحة التحكم
// يعيد undefined عند غياب الإعداد حتى يبقى اللون الافتراضي من globals.css
export async function getThemeCssVars(
  workspaceId: string
): Promise<Record<string, string> | undefined> {
  const row = await prisma.setting.findUnique({
    where: { workspaceId_key: { workspaceId, key: THEME_KEY } },
  });
  const color = row?.value?.trim();
  if (!color || !isValidHexColor(color)) return undefined;

  const hsl = hexToHsl(color);
  if (!hsl) return undefined;
  const primary = `${hsl.h} ${hsl.s}% ${hsl.l}%`;
  return {
    "--primary": primary,
    "--ring": primary,
    "--primary-foreground": foregroundFor(hsl),
  };
}
