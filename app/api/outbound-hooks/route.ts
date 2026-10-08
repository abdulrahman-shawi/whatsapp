import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { validateOutboundWebhookInput } from "@/lib/outbound-events";

// قائمة ويب هوكات الصادر لمساحة العمل — للمالك فقط
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الإدارة للمالك فقط" }, { status: 403 });
  }

  const webhooks = await prisma.outboundWebhook.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    webhooks: webhooks.map((w) => ({
      ...w,
      secret: w.secret ? "••••••" : null,
      createdAt: w.createdAt.toISOString(),
      lastFiredAt: w.lastFiredAt ? w.lastFiredAt.toISOString() : null,
    })),
  });
}

// إنشاء ويب هوك صادر: يرسل الأحداث المختارة إلى رابط خارجي — للمالك فقط
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "الإنشاء للمالك فقط" }, { status: 403 });
  }

  const { data, error } = validateOutboundWebhookInput(await req.json().catch(() => null));
  if (error || !data) {
    return NextResponse.json({ error: error ?? "طلب غير صالح" }, { status: 400 });
  }

  const webhook = await prisma.outboundWebhook.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: data.name,
      url: data.url,
      events: data.events,
      secret: data.secret,
    },
  });
  return NextResponse.json(
    {
      webhook: {
        ...webhook,
        secret: webhook.secret ? "••••••" : null,
        createdAt: webhook.createdAt.toISOString(),
        lastFiredAt: null,
      },
    },
    { status: 201 }
  );
}
