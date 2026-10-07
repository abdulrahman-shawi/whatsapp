// تعريف محلي لـ web-push — الحزمة لا ترفق أنواعاً و@types/web-push غير منصّبة
declare module "web-push" {
  export interface PushKeys {
    p256dh: string;
    auth: string;
  }
  export interface PushSubscription {
    endpoint: string;
    keys: PushKeys;
  }
  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string
  ): void;
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string
  ): Promise<{ statusCode: number; body?: string; headers?: unknown }>;
}
