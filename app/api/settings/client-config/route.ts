import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { getIntegration } from "@/lib/settings";

// إعدادات عامة يحتاجها المتصفح — مفاتيح Pusher فقط (آمنة للعرض)
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const [pusherKey, pusherCluster] = await Promise.all([
    getIntegration(ctx.workspaceId, "PUSHER_KEY"),
    getIntegration(ctx.workspaceId, "PUSHER_CLUSTER"),
  ]);

  return NextResponse.json({ pusherKey, pusherCluster });
}
