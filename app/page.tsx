import { redirect } from "next/navigation";

// الصفحة الرئيسية توجّه مباشرة إلى صندوق الوارد (أو تسجيل الدخول عبر middleware)
export default function Home() {
  redirect("/inbox");
}
