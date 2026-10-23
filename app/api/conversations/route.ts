import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import {
  getWorkspaceConversations,
  getStaffRestrictionFilter,
  type AssignmentFilter,
} from "@/lib/conversations";
import { isConversationTopic } from "@/lib/sentiment";

const FILTERS: AssignmentFilter[] = ["all", "mine", "unassigned"];

// قائمة محادثات مساحة العمل —
// ?archived=true للمؤرشفة، ?closed=true للمغلقة، ?filter=mine|unassigned للإسناد
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const archived = params.get("archived") === "true";
  const closed = params.get("closed") === "true";
  const followups = params.get("followups") === "true";
  const filterParam = params.get("filter");
  const filter = FILTERS.includes(filterParam as AssignmentFilter)
    ? (filterParam as AssignmentFilter)
    : "all";
  const topicParam = params.get("topic");
  const topic = topicParam && isConversationTopic(topicParam) ? topicParam : undefined;

  const restrictToUserId = await getStaffRestrictionFilter(
    ctx.workspaceId,
    ctx.role,
    ctx.userId
  );

  const conversations = await getWorkspaceConversations(ctx.workspaceId, {
    archived,
    closed,
    followups,
    filter,
    topic,
    userId: ctx.userId,
    restrictToUserId,
  });
  return NextResponse.json({ conversations });
}
