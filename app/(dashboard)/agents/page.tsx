import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, GraduationCap, Pencil, Plus } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AgentActions } from "@/components/agents/agent-actions";

export const dynamic = "force-dynamic";

// قائمة وكلاء مساحة العمل
export default async function AgentsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const agents = await prisma.agent.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { knowledgeSources: true, conversations: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الوكلاء</h1>
          <p className="text-sm text-muted-foreground">
            أنشئ وكلاء رد آلي ودرّبهم على معلومات نشاطك
          </p>
        </div>
        <Button asChild>
          <Link href="/agents/new">
            <Plus className="h-4 w-4" />
            وكيل جديد
          </Link>
        </Button>
      </div>

      {agents.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <Bot className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">لا يوجد وكلاء بعد</p>
          <p className="text-sm text-muted-foreground">
            أنشئ أول وكيل ليبدأ الرد على عملائك تلقائياً
          </p>
          <Button asChild className="mt-2">
            <Link href="/agents/new">
              <Plus className="h-4 w-4" />
              وكيل جديد
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{agent.name}</CardTitle>
                  <Badge variant={agent.isActive ? "success" : "secondary"}>
                    {agent.isActive ? "نشط" : "متوقف"}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">
                  {agent.systemPrompt}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{agent._count.knowledgeSources} مصادر معرفة</span>
                  <span>{agent._count.conversations} محادثة</span>
                  <span>ينتظر {agent.responseDelaySec} ثوانٍ</span>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/agents/${agent.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                        تعديل
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/agents/${agent.id}/training`}>
                        <GraduationCap className="h-4 w-4" />
                        التدريب
                      </Link>
                    </Button>
                  </div>
                  <AgentActions id={agent.id} isActive={agent.isActive} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
