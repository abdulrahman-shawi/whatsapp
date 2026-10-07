import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/session";
import { ContactsClient } from "@/components/contacts/contacts-client";

export const dynamic = "force-dynamic";

// صفحة العملاء: قائمة كاملة بفلاتر وتصدير — يدير الجلب والفلترة العميل
export default async function ContactsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  return <ContactsClient />;
}
