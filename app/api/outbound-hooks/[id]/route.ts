import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fireOutboundEvent } from "@/lib/outbound-webhooks";
import { validateOutboundWebhookInput } from "@/lib/outbound-events";

type Params = { params: { id: string } };

function serialize(w: {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  isActive: boolean;
  lastFiredAt: Date | null;
  lastStatus: number | null;
  createdAt: Date;
}) {
  return {
    ...w,
    secret: w.secret ? "••••••" : null,
    createdAt: w.createdAt.toISOString(),
    lastFiredAt: w.lastFiredAt ? w.lastFiredAt.toISOString() : null,
  };
}

// تحديث ويب هوك صادر: الاسم/الرابط/الأحداث/السر أو تفعيل/إيقاف — للمالك فقط
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "التعديل للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.outboundWebhook.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الويب هوك غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  // تبديل التفعيل وحده — دون إعادة التحقق من بقية الحقول
  if (
    Object.keys(b).length === 1 &&
    typeof b.isActive === "boolean"
  ) {
    const webhook = await prisma.outboundWebhook.update({
      where: { id: params.id },
      data: { isActive: b.isActive },
    });
    return NextResponse.json({ webhook: serialize(webhook) });
  }

  const { data, error } = validateOutboundWebhookInput(body);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "طلب غير صالح" }, { status: 400 });
  }

  const webhook = await prisma.outboundWebhook.update({
    where: { id: params.id },
    data: {
      name: data.name,
      url: data.url,
      events: data.events,
      // سر فارغ يعني إبقاء الموجود؛ القيمة الجديدة تُخزن كما هي
      secret: data.secret ?? existing.secret,
    },
  });
  return NextResponse.json({ webhook: serialize(webhook) });
}

// حذف ويب هوك صادر — للمالك فقط
export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الحذف للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.outboundWebhook.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "الويب هوك غير موجود" }, { status: 404 });
  }

  await prisma.outboundWebhook.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

// إرسال تجريبي: يطلق حدث ping بحمولة اختبار ويعيد رمز الحالة المُستلَم
export async function POST(_req: Request, { params }: Params) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الاختبار للمالك فقط" }, { status: 403 });
  }

  const existing = await prisma.outboundWebhook.findFirst({
    where: { id: params.id, workspaceId: ctx.workspaceId },
    select: { id: true, isActive: true, events: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "الويب هوك غير موجود" }, { status: 404 });
  }

  // مؤقتاً: فعّله واشتركه في ping ثم أعده كما كان — حتى يعمل الاختبار للموقوف
  const wasActive = existing.isActive;
  const hadPing = existing.events.includes("ping");
  if (!wasActive || !hadPing) {
    await prisma.outboundWebhook.update({
      where: { id: params.id },
      data: {
        isActive: true,
        events: hadPing ? existing.events : [...existing.events, "ping"],
      },
    });
  }

  const done = new Promise<number>((resolve) => {
    const started = Date.now();
    const poll = setInterval(async () => {
      const w = await prisma.outboundWebhook.findUnique({
        where: { id: params.id },
        select: { lastFiredAt: true, lastStatus: true },
      });
      // آخر إطلاق بعد بداية الاختبار = نتيجة الـ ping
      if (w?.lastFiredAt && w.lastFiredAt.getTime() >= started) {
        clearInterval(poll);
        resolve(w.lastStatus ?? 0);
      }
      if (Date.now() - started > 12000) {
        clearInterval(poll);
        resolve(-1);
      }
    }, 400);
  });

  fireOutboundEvent(ctx.workspaceId, "ping", { test: true });

  const status = await done;

  // إعادة الويب هوك لحالته الأصلية
  if (!wasActive || !hadPing) {
    await prisma.outboundWebhook.update({
      where: { id: params.id },
      data: {
        isActive: wasActive,
        events: existing.events,
      },
    });
  }

  if (status === -1) {
    return NextResponse.json(
      { error: "انتهت مهلة الاختبار دون استجابة" },
      { status: 408 }
    );
  }
  return NextResponse.json({ status });
}
