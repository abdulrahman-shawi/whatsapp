import { withAuth } from "next-auth/middleware";

// حماية صفحات لوحة التحكم — غير المسجّل يُحوَّل إلى /login
export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/inbox/:path*",
    "/broadcast/:path*",
    "/forms/:path*",
    "/webhooks/:path*",
    "/api-keys/:path*",
    "/audit/:path*",
    "/contacts/:path*",
    "/bookings/:path*",
    "/reports/:path*",
    "/workflows/:path*",
    "/agents/:path*",
    "/widget/:path*",
    "/usage/:path*",
    "/billing/:path*",
    "/settings/:path*",
  ],
};
