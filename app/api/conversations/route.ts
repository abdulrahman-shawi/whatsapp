import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { getWorkspaceConversations } from "@/lib/conversations";

// قائمة محادثات مساحة العمل — ?archived=true للمؤرشفة
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const archived =
    new URL(req.url).searchParams.get("archived") === "true";
  const conversations = await getWorkspaceConversations(
    ctx.workspaceId,
    archived
  );
  return NextResponse.json({ conversations });
}
