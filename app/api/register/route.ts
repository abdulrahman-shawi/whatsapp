import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// تسجيل مستخدم جديد —
// مع inviteToken صالح: ينضم لمساحة العامل الداعية بدورها (رابط أحادي الاستخدام)
// بدونه: ينشئ مساحة عمل افتراضية له كمالك
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, inviteToken } = body ?? {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      !email.trim() ||
      password.length < 6
    ) {
      return NextResponse.json(
        { error: "يرجى إدخال الاسم والبريد الإلكتروني وكلمة مرور (6 أحرف على الأقل)" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "هذا البريد الإلكتروني مسجّل مسبقاً" },
        { status: 409 }
      );
    }

    // البحث عن الدعوة أولاً — تُستهلك داخل معاملة مع إنشاء الحساب
    const invite =
      typeof inviteToken === "string" && inviteToken
        ? await prisma.workspaceInvite.findUnique({ where: { token: inviteToken } })
        : null;
    if (inviteToken && !invite) {
      console.warn("[register] توكن دعوة غير صالح — سيُنشأ حساب بمساحة جديدة");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          passwordHash,
          memberships: invite
            ? {
                create: { role: invite.role, workspaceId: invite.workspaceId },
              }
            : {
                create: {
                  role: "OWNER",
                  workspace: { create: { name: `مساحة عمل ${name.trim()}` } },
                },
              },
        },
      });
      // الدعوة لمرة واحدة — نحذفها فور استخدامها
      if (invite) {
        await tx.workspaceInvite.delete({ where: { id: invite.id } });
      }
      return created;
    });

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
