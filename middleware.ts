import { withAuth } from "next-auth/middleware";

// حماية صفحات لوحة التحكم — غير المسجّل يُحوَّل إلى /login
export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/inbox/:path*", "/agents/:path*", "/widget/:path*", "/usage/:path*"],
};
