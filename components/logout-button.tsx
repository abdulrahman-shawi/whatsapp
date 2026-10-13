"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

// زر تسجيل الخروج في الشريط الجانبي (نسخة مدمجة داكنة)
// redirect:false ثم تنقّل محلي — لا نعتمد على NEXTAUTH_URL قد يشير لنطاق معاينة
export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      title="تسجيل الخروج"
      aria-label="تسجيل الخروج"
      className="grid size-9 shrink-0 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-tomato"
      onClick={async () => {
        await signOut({ redirect: false });
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}
