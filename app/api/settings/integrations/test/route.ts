import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { getIntegration } from "@/lib/settings";

type TestBody = {
  channel?: string;
  values?: Record<string, string>;
};

function readValue(
  body: TestBody,
  key: "TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID" | "WIDGET_API_KEY" | "WIDGET_APP_ID" | "WHATSAPP_TOKEN" | "WHATSAPP_PHONE_NUMBER_ID",
  fallback: string | null
): string | null {
  const fromBody = body.values?.[key]?.trim();
  if (fromBody) return fromBody;
  return fallback;
}

export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as TestBody | null;
  const channel = body?.channel;
  if (!body || typeof body !== "object" || typeof channel !== "string") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  if (channel === "whatsapp") {
    const token = readValue(body, "WHATSAPP_TOKEN", await getIntegration(ctx.workspaceId, "WHATSAPP_TOKEN"));
    const phoneNumberId = readValue(
      body,
      "WHATSAPP_PHONE_NUMBER_ID",
      await getIntegration(ctx.workspaceId, "WHATSAPP_PHONE_NUMBER_ID")
    );
    if (!token || !phoneNumberId) {
      return NextResponse.json(
        { ok: false, message: "أدخل توكن واتساب ومعرّف الرقم أولاً" },
        { status: 400 }
      );
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phoneNumberId,
            type: "template",
            template: { name: "hello_world", language: { code: "en_US" } },
          }),
          signal: AbortSignal.timeout(15_000),
        }
      );
      const text = await res.text();
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, message: `فشل الاتصال بواتساب — الحالة ${res.status}` },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, message: "تم الاتصال بواتساب بنجاح" });
    } catch {
      return NextResponse.json(
        { ok: false, message: "تعذّر الوصول إلى خوادم واتساب" },
        { status: 502 }
      );
    }
  }

  if (channel === "telegram") {
    const token = readValue(body, "TELEGRAM_BOT_TOKEN", await getIntegration(ctx.workspaceId, "TELEGRAM_BOT_TOKEN"));
    const chatId = readValue(body, "TELEGRAM_CHAT_ID", await getIntegration(ctx.workspaceId, "TELEGRAM_CHAT_ID"));
    if (!token || !chatId) {
      return NextResponse.json(
        { ok: false, message: "أدخل توكن البوت ومعرّف المحادثة أولاً" },
        { status: 400 }
      );
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "اختبار اتصال من منصة ردّ" }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, message: `فشل الاتصال بتيليجرام — الحالة ${res.status}` },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, message: "تم الاتصال بتيليجرام بنجاح" });
    } catch {
      return NextResponse.json(
        { ok: false, message: "تعذّر الوصول إلى خوادم تيليجرام" },
        { status: 502 }
      );
    }
  }

  if (channel === "widget") {
    const apiKey = readValue(body, "WIDGET_API_KEY", await getIntegration(ctx.workspaceId, "WIDGET_API_KEY"));
    const appId = readValue(body, "WIDGET_APP_ID", await getIntegration(ctx.workspaceId, "WIDGET_APP_ID"));
    if (!apiKey || !appId) {
      return NextResponse.json(
        { ok: false, message: "أدخل مفتاح API ومعرّف التطبيق أولاً" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, message: "تم الاتصال بالويدجت بنجاح" });
  }

  return NextResponse.json({ error: "قناة غير معروفة" }, { status: 400 });
}
