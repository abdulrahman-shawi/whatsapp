import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  isValidCustomDomain,
  isValidSubdomain,
  normalizeHostname,
} from "@/lib/workspace-domains";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: {
      subdomain: true,
      customDomain: true,
      customDomainVerificationToken: true,
      customDomainVerifiedAt: true,
    },
  });
  if (!workspace) {
    return NextResponse.json({ error: "مساحة العمل غير موجودة" }, { status: 404 });
  }
  return NextResponse.json(workspace);
}

export async function PUT(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "إعداد النطاق للمالك فقط" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  try {
    if (body.subdomain !== undefined) {
      if (
        body.subdomain !== null &&
        (typeof body.subdomain !== "string" ||
          !isValidSubdomain(body.subdomain.trim().toLowerCase()))
      ) {
        return NextResponse.json({ error: "اسم النطاق الفرعي غير صالح" }, { status: 400 });
      }
      const workspace = await prisma.workspace.update({
        where: { id: ctx.workspaceId },
        data: {
          subdomain:
            typeof body.subdomain === "string"
              ? body.subdomain.trim().toLowerCase() || null
              : null,
        },
        select: { subdomain: true },
      });
      return NextResponse.json(workspace);
    }

    if (body.customDomain !== undefined) {
      if (
        body.customDomain !== null &&
        (typeof body.customDomain !== "string" ||
          !isValidCustomDomain(body.customDomain))
      ) {
        return NextResponse.json({ error: "الدومين المخصص غير صالح" }, { status: 400 });
      }
      const customDomain =
        typeof body.customDomain === "string" && body.customDomain.trim()
          ? normalizeHostname(body.customDomain)
          : null;
      const workspace = await prisma.workspace.update({
        where: { id: ctx.workspaceId },
        data: {
          customDomain,
          customDomainVerificationToken: customDomain
            ? randomBytes(24).toString("hex")
            : null,
          customDomainVerifiedAt: null,
        },
        select: {
          customDomain: true,
          customDomainVerificationToken: true,
          customDomainVerifiedAt: true,
        },
      });
      return NextResponse.json(workspace);
    }

    return NextResponse.json({ error: "لا يوجد نطاق صالح للتحديث" }, { status: 400 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "هذا النطاق مرتبط بمساحة عمل أخرى" },
        { status: 409 }
      );
    }
    throw error;
  }
}

export async function POST() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "إعداد النطاق للمالك فقط" }, { status: 403 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { customDomain: true, customDomainVerificationToken: true },
  });
  if (!workspace?.customDomain || !workspace.customDomainVerificationToken) {
    return NextResponse.json({ error: "أضف دوميناً مخصصاً أولاً" }, { status: 400 });
  }
  try {
    const records = await resolveTxt(`radd-verification.${workspace.customDomain}`);
    const expected = `radd-verification=${workspace.customDomainVerificationToken}`;
    const verified = records.some((record) => record.join("") === expected);
    if (!verified) {
      return NextResponse.json(
        { error: "لم يُعثر على سجل TXT المطلوب بعد. تحقق من DNS ثم أعد المحاولة." },
        { status: 400 }
      );
    }
    await prisma.workspace.update({
      where: { id: ctx.workspaceId },
      data: { customDomainVerifiedAt: new Date() },
    });
    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("[workspace-domain] تعذّر التحقق من TXT:", error);
    return NextResponse.json(
      { error: "تعذّر فحص DNS. تحقق من إعداد النطاق ثم أعد المحاولة." },
      { status: 502 }
    );
  }
}
