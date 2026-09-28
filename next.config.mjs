// ضمان أن NEXTAUTH_URL ليست فارغة أبداً أثناء البناء —
// next-auth/react يستدعي new URL(NEXTAUTH_URL) عند التحميل،
// وقيمة فارغة في Vercel تُسقط البناء (Invalid URL)
if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
}

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
