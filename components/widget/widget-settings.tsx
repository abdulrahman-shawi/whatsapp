"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyButton } from "./copy-button";
import { WidgetPreview } from "./widget-preview";

type AgentOption = { id: string; name: string };

// إعدادات الويدجت: اختيار الوكيل، كود التضمين، ومعاينة حية
export function WidgetSettings({ agents }: { agents: AgentOption[] }) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const agent = agents.find((a) => a.id === agentId);

  // نطاق الموقع الحالي — يبني كود التضمين بالدومين الصحيح تلقائياً
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://example.com";
  const snippet = agentId
    ? `<script src="${origin}/widget.js" data-agent-id="${agentId}" async></script>`
    : "";

  if (!agent) {
    return (
      <Card className="py-12 text-center">
        <p className="font-medium">لا يوجد وكلاء نشطون</p>
        <p className="mt-1 text-sm text-muted-foreground">
          أنشئ وكيلاً وفعّله من صفحة الوكلاء أولاً
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        {/* اختيار الوكيل */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">اختيار الوكيل</CardTitle>
            <CardDescription>
              الوكيل الذي سيرد على زوار موقعك
            </CardDescription>
          </CardHeader>
          <CardContent>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="mt-3">
              <Badge variant="success">نشط</Badge>
            </div>
          </CardContent>
        </Card>

        {/* كود التضمين */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">كود التضمين</CardTitle>
            <CardDescription>
              الصق هذا الكود في موقعك قبل وسم الإغلاق{" "}
              <code dir="ltr">&lt;/body&gt;</code> مباشرة — وسيظهر زر المحادثة
              تلقائياً لزوارك
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre
              dir="ltr"
              className="overflow-x-auto rounded-md bg-muted p-3 text-left text-xs leading-relaxed"
            >
              {snippet}
            </pre>
            <CopyButton text={snippet} />
          </CardContent>
        </Card>
      </div>

      {/* المعاينة الحية */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">معاينة حية</CardTitle>
          <CardDescription>
            هكذا سيظهر الويدجت لزوار موقعك — جرّب إرسال رسالة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WidgetPreview agentId={agentId} />
        </CardContent>
      </Card>
    </div>
  );
}
