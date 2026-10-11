"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

// زر تسجيل الخروج في الشريط الجانبي
// redirect:false ثم تنقّل محلي — لا نعتمد على NEXTAUTH_URL قد يشير لنطاق معاينة
export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
      onClick={async () => {
        await signOut({ redirect: false });
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" />
      تسجيل الخروج
    </Button>
  );
}
