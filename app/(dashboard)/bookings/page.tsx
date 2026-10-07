import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { BookingsClient } from "@/components/bookings/bookings-client";

export const dynamic = "force-dynamic";

// صفحة الحجوزات: تقويم شهري لكل المواعيد + إنشاء سريع
export default async function BookingsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  return <BookingsClient />;
}
