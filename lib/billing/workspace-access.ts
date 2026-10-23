import { getWorkspaceTrialStatus } from "@/lib/billing/plans";

export async function workspaceIsReadOnly(workspaceId: string): Promise<boolean> {
  return (await getWorkspaceTrialStatus(workspaceId)).expired;
}

export function upgradeRequiredMessage(): string {
  return "انتهت التجربة المجانية. مساحة العمل الآن للقراءة فقط؛ اختر باقة من صفحة الاشتراك لاستعادة الإرسال والذكاء الاصطناعي.";
}
