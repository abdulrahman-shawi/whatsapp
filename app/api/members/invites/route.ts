import crypto from "crypto";
import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// إنشاء دعوة انضمام لمرة واحدة — مالك مساحة العمل فقط
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json(
      { error: "إنشاء الدعوات للمالك فقط" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const role = body?.role === "OWNER" ? "OWNER" : "STAFF";

  const invite = await prisma.workspaceInvite.create({
    data: {
      token: crypto.randomBytes(24).toString("hex"),
      workspaceId: ctx.workspaceId,
      role,
    },
  });

  // تدقيق إنشاء الدعوة (دور فقط — بدون التوكن)
  void logAudit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "CREATE",
    entity: "member",
    entityId: invite.id,
    meta: { role },
  });

  const url = `${new URL(req.url).origin}/register?invite=${invite.token}`;
  return NextResponse.json(
    { invite: { id: invite.id, token: invite.token, role: invite.role }, url },
    { status: 201 }
  );
}
