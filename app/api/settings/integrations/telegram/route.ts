import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getIntegration, getIntegrationList } from "@/lib/settings";
import {
  getTelegramBot,
  getTelegramWebhookInfo,
  setTelegramWebhook,
} from "@/lib/telegram";
import { logAudit } from "@/lib/audit";

function publicAppOrigin(req: Request): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  const url = new URL(configured ?? new URL(req.url).origin);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("يلزم رابط HTTPS عام للتطبيق لتسجيل Webhook تيليجرام");
  }
  return url.origin;
}

function webhookPath(workspaceId: string): string {
  return `/api/webhooks/telegram/${encodeURIComponent(workspaceId)}`;
}

// حالة الاتصال الفعلية لدى تيليجرام، وليست مجرد وجود توكن محفوظ.
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const token = await getIntegration(ctx.workspaceId, "TELEGRAM_BOT_TOKEN");
  if (!token) {
    return NextResponse.json({
      connection: { configured: false, connected: false },
    });
  }

  try {
    const info = await getTelegramWebhookInfo(token);
    let connected = false;
    if (info.url) {
      try {
        connected = new URL(info.url).pathname === webhookPath(ctx.workspaceId);
      } catch {
        connected = false;
      }
    }
    return NextResponse.json({
      connection: {
        configured: true,
        connected,
        webhookUrl: info.url || null,
        pendingUpdates: info.pending_update_count ?? 0,
        error: info.last_error_message ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "تعذّر قراءة حالة اتصال تيليجرام",
      },
      { status: 502 }
    );
  }
}

// التحقق من التوكن ثم تسجيل Webhook بسرّ خاص بمساحة العمل.
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الاتصال للمالك فقط" }, { status: 403 });
  }

  const token = await getIntegration(ctx.workspaceId, "TELEGRAM_BOT_TOKEN");
  if (!token) {
    return NextResponse.json(
      { error: "احفظ توكن بوت تيليجرام أولاً" },
      { status: 400 }
    );
  }

  let webhookUrl: string;
  try {
    webhookUrl = `${publicAppOrigin(req)}${webhookPath(ctx.workspaceId)}`;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "رابط التطبيق العام غير صالح",
      },
      { status: 400 }
    );
  }

  try {
    const bot = await getTelegramBot(token);
    if (!bot.is_bot) throw new Error("التوكن لا يخص بوت تيليجرام");

    const existingSecret = await getIntegration(
      ctx.workspaceId,
      "TELEGRAM_WEBHOOK_SECRET"
    );
    const secret = existingSecret?.trim() || randomBytes(32).toString("hex");
    if (!existingSecret?.trim()) {
      await prisma.setting.upsert({
        where: {
          workspaceId_key: {
            workspaceId: ctx.workspaceId,
            key: "TELEGRAM_WEBHOOK_SECRET",
          },
        },
        update: { value: secret },
        create: {
          workspaceId: ctx.workspaceId,
          key: "TELEGRAM_WEBHOOK_SECRET",
          value: secret,
        },
      });
    }

    const registered = await setTelegramWebhook({
      token,
      url: webhookUrl,
      secret,
    });
    if (!registered) throw new Error("لم يؤكد تيليجرام تسجيل Webhook");

    void logAudit({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "UPDATE",
      entity: "setting",
      meta: { telegramConnected: true },
    });

    return NextResponse.json({
      connection: {
        configured: true,
        connected: true,
        username: bot.username ?? null,
        webhookUrl,
        pendingUpdates: 0,
        error: null,
      },
      integrations: await getIntegrationList(ctx.workspaceId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "تعذّر تسجيل Webhook تيليجرام",
      },
      { status: 502 }
    );
  }
}
