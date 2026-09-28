import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPusher } from "@/lib/pusher";

// تفويض القنوات الخاصة: نتحقق أن المستخدم عضو في مساحة العمل المطلوبة
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const pusher = getPusher();
  if (!pusher) {
    return NextResponse.json({ error: "Pusher غير مفعّل" }, { status: 503 });
  }

  // pusher-js يرسل البيانات كـ form-encoded
  const form = await req.formData();
  const socketId = form.get("socket_id");
  const channelName = form.get("channel_name");
  if (typeof socketId !== "string" || typeof channelName !== "string") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  // استخراج معرّف مساحة العمل من اسم القناة والتحقق من العضوية
  const workspaceId = channelName.replace(/^private-workspace-/, "");
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, workspaceId },
  });
  if (!membership) {
    return NextResponse.json({ error: "غير مصرّح بهذه القناة" }, { status: 403 });
  }

  return NextResponse.json(pusher.authenticate(socketId, channelName));
}
