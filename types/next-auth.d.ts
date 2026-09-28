import NextAuth from "next-auth";

// إضافة حقل id إلى المستخدم في الجلسة والتوكن
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
