import { withSentryConfig } from "@sentry/nextjs";

// ضمان أن NEXTAUTH_URL ليست فارغة أبداً أثناء البناء —
// next-auth/react يستدعي new URL(NEXTAUTH_URL) عند التحميل،
// وقيمة فارغة في Vercel تُسقط البناء (Invalid URL)
if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  disableLogger: true,
  telemetry: false,
  hideSourceMaps: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: true,
});
