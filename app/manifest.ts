import type { MetadataRoute } from "next";

// بيان PWA: تثبيت التطبيق بالوضع المستقل مع اتجاه RTL
// اللون الأساسي مطابق لـ --primary في app/globals.css (بنفسجي)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "فلووو",
    short_name: "فلووو",
    dir: "rtl",
    lang: "ar",
    display: "standalone",
    theme_color: "#7c3aed",
    background_color: "#ffffff",
    start_url: "/inbox",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
