"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "./copy-button";
import { WidgetPreview, type WidgetPreviewConfig } from "./widget-preview";

type AgentOption = {
  id: string;
  name: string;
  welcomeMessage: string;
  widget: { title?: string; subtitle?: string; color?: string } | null;
};

const DEFAULTS: WidgetPreviewConfig = {
  title: "تحدث معنا",
  subtitle: "",
  color: "#7c3aed",
};

// إعدادات الويدجت: اختيار الوكيل، تخصيص المظهر ورسالة الترحيب، كود التضمين، ومعاينة حية
export function WidgetSettings({ agents }: { agents: AgentOption[] }) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const agent = agents.find((a) => a.id === agentId);

  // نموذج التخصيص: العنوان والوصف واللون ورسالة الترحيب للوكيل المختار
  const [config, setConfig] = useState<WidgetPreviewConfig>(DEFAULTS);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // تعبئة النموذج بإعدادات الوكيل المختار، وتصفير المعاينة عند تغييره
  useEffect(() => {
    if (!agent) return;
    setConfig({
      title: agent.widget?.title ?? DEFAULTS.title,
      subtitle: agent.widget?.subtitle ?? "",
      color: agent.widget?.color ?? DEFAULTS.color,
    });
    setWelcomeMessage(agent.welcomeMessage ?? "");
    setFeedback(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // نطاق الموقع الحالي — يبني كود التضمين بالدومين الصحيح تلقائياً
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://example.com";
  const snippet = agentId
    ? `<script src="${origin}/widget.js" data-agent-id="${agentId}" async></script>`
    : "";

  // حفظ المظهر في إعدادات مساحة العمل، ورسالة الترحيب على الوكيل
  async function save() {
    if (!agent || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/widget/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          title: config.title,
          subtitle: config.subtitle,
          color: config.color,
          welcomeMessage,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "تعذّر الحفظ — حاول مجدداً");
      setFeedback({ ok: true, text: "تم حفظ الإعدادات" });
    } catch (e) {
      setFeedback({
        ok: false,
        text: e instanceof Error ? e.message : "تعذّر الحفظ — حاول مجدداً",
      });
    } finally {
      setSaving(false);
    }
  }

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

        {/* تخصيص المظهر ورسالة الترحيب */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">مظهر الويدجت</CardTitle>
            <CardDescription>
              تُطبَّق على كود التضمين تلقائياً — ويمكن تجاوز أي قيمة في موقعك
              بخاصية <code dir="ltr">data-</code> مباشرة في وسم السكربت
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wa-title">العنوان</Label>
              <Input
                id="wa-title"
                value={config.title}
                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                placeholder="تحدث معنا"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-subtitle">الوصف التعريفي</Label>
              <Input
                id="wa-subtitle"
                value={config.subtitle}
                onChange={(e) =>
                  setConfig({ ...config, subtitle: e.target.value })
                }
                placeholder="نرد عليك خلال دقائق…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-color">لون الرأس والزر</Label>
              <div className="flex gap-2" dir="ltr">
                <input
                  type="color"
                  id="wa-color"
                  value={config.color}
                  onChange={(e) =>
                    setConfig({ ...config, color: e.target.value })
                  }
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                />
                <Input
                  value={config.color}
                  onChange={(e) =>
                    setConfig({ ...config, color: e.target.value })
                  }
                  placeholder="#7c3aed"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-welcome">رسالة الترحيب</Label>
              <Textarea
                id="wa-welcome"
                rows={3}
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="أهلاً بك! كيف أقدر أساعدك اليوم؟"
              />
              <p className="text-xs text-muted-foreground">
                أول رسالة يرسلها الوكيل تلقائياً عند بدء محادثة جديدة مع زائر
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>
                {saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
              </Button>
              {feedback && (
                <span
                  className={
                    feedback.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"
                  }
                >
                  {feedback.text}
                </span>
              )}
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
          <WidgetPreview agentId={agentId} config={config} />
        </CardContent>
      </Card>
    </div>
  );
}
