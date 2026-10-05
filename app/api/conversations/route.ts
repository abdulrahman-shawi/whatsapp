import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import {
  getWorkspaceConversations,
  type AssignmentFilter,
} from "@/lib/conversations";

const FILTERS: AssignmentFilter[] = ["all", "mine", "unassigned"];

// قائمة محادثات مساحة العمل —
// ?archived=true للمؤرشفة، ?closed=true للمغلقة، ?filter=mine|unassigned للإسناد
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const archived = params.get("archived") === "true";
  const closed = params.get("closed") === "true";
  const filterParam = params.get("filter");
  const filter = FILTERS.includes(filterParam as AssignmentFilter)
    ? (filterParam as AssignmentFilter)
    : "all";

  const conversations = await getWorkspaceConversations(ctx.workspaceId, {
    archived,
    closed,
    filter,
    userId: ctx.userId,
  });
  return NextResponse.json({ conversations });
}
