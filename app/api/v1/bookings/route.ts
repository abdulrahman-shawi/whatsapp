import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// قائمة الحجوزات القادمة
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json(
      { error: "مفتاح API غير صالح" },
      { status: 401 }
    );
  }

  const limit = Math.min(
    Math.max(
      parseInt(new URL(req.url).searchParams.get("limit") ?? "100", 10) || 100,
      1
    ),
    500
  );

  const bookings = await prisma.booking.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      notes: true,
      contact: { select: { name: true, waPhone: true } },
    },
  });

  return NextResponse.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      title: b.title,
      scheduledAt: b.scheduledAt.toISOString(),
      notes: b.notes,
      contact: b.contact,
    })),
  });
}
