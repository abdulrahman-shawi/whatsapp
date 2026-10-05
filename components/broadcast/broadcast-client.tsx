"use client";

import { useState } from "react";
import { Loader2, Megaphone, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/time";
import type { TemplateInfo } from "@/components/inbox/types";

type Campaign = {
  id: string;
  tag: string;
  body: string;
  status: "QUEUED" | "SENDING" | "SENT" | "PARTIAL" | "FAILED";
  totalCount: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | Date | null;
  createdAt: string | Date;
};

const statusConfig: Record<
  Campaign["status"],
  { label: string; variant: "default" | "secondary" | "warning" | "outline" | "success" }
> = {
  QUEUED: { label: "مجدولة", variant: "outline" },
  SENDING: { label: "جارٍ الإرسال", variant: "warning" },
  SENT: { label: "مكتملة", variant: "success" },
  PARTIAL: { label: "جزئية", variant: "secondary" },
  FAILED: { label: "فاشلة", variant: "outline" },
};

// حملات البث الجماعي: إنشاء حملة لجمهور تسمية مع سجل النتائج
export function BroadcastClient({
  initialCampaigns,
  tags,
  templates,
}: {
  initialCampaigns: Campaign[];
  tags: string[];
  templates: TemplateInfo[];
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [tag, setTag] = useState(tags[0] ?? "");
  const [templateId, setTemplateId] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);

  // القالب المختار ومتغيراته {{n}} مرتبة برقم المتغير
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const templateVars: number[] = selectedTemplate
    ? [
        ...new Set(
          [...selectedTemplate.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
            Number(m[1])
          )
        ),
      ].sort((a, b) => a - b)
    : [];

  async function handleLaunch() {
    setSending(true);
    setError("");
    setResult("");
    const res = await fetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag,
        body,
        templateId: templateId || null,
        // قيم متغيرات القالب مرتبة برقم المتغير — {{n}} في index n-1
        params: templateId
          ? templateVars.map((n) => params[n - 1] ?? "")
          : undefined,
        // القيمة الفارغة تعني الإرسال الفوري
        scheduledAt: scheduledAt || null,
      }),
    });
    setSending(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "حدث خطأ أثناء إطلاق الحملة");
      return;
    }
    setCampaigns((prev) => [data.campaign, ...prev]);
    setResult(
      data.campaign.status === "QUEUED"
        ? "تمت جدولة الحملة"
        : `أُرسلت الحملة: ${data.campaign.sentCount} نجاح، ${data.campaign.failedCount} فشل`
    );
    setBody("");
    setTemplateId("");
    setParams([]);
    setScheduledAt("");
  }

  // إرسال حملة مجدولة فوراً دون انتظار موعدها
  async function handleSendNow(campaign: Campaign) {
    setSendingNowId(campaign.id);
    setError("");
    const res = await fetch(`/api/broadcasts/${campaign.id}/send`, {
      method: "POST",
    });
    const data = await res.json().catch(() => null);
    setSendingNowId(null);
    if (!res.ok) {
      setError(data?.error ?? "حدث خطأ أثناء الإرسال الفوري");
      return;
    }
    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaign.id ? data.campaign : c))
    );
  }

  return (
    <div className="space-y-6">
      {/* نموذج إنشاء حملة */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Megaphone className="h-5 w-5" />
          حملة جديدة
        </h2>

        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد تسميات بعد — أضف تسميات لجهات الاتصال من لوحة جهة الاتصال
            في صندوق الوارد أولاً
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="bc-tag">جمهور الحملة (تسمية جهات الاتصال)</Label>
              <select
                id="bc-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="bc-template">قالب ميتا (اختياري — للبث الواسع)</Label>
              <select
                id="bc-template"
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setParams([]);
                }}
                className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">بدون قالب — رسالة نصية</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
              {templateId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  سيُرسل القالب كما هو معتمداً في ميتا مع تعبئة متغيراته — نص
                  الحقل أدناه للمعاينة فقط
                </p>
              )}
            </div>

            {/* قيم متغيرات القالب {{n}} — واحد لكل متغير */}
            {selectedTemplate && templateVars.length > 0 && (
              <div className="space-y-2">
                {templateVars.map((n) => (
                  <div key={n}>
                    <Label htmlFor={`bc-param-${n}`}>
                      {`قيمة {{${n}}} — اكتب {{name}} لتخصيصها باسم كل عميل`}
                    </Label>
                    <Input
                      id={`bc-param-${n}`}
                      className="mt-1.5"
                      value={params[n - 1] ?? ""}
                      onChange={(e) =>
                        setParams((prev) => {
                          const next = [...prev];
                          next[n - 1] = e.target.value;
                          return next;
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            <div>
              <Label htmlFor="bc-body">نص الرسالة</Label>
              <Textarea
                id="bc-body"
                rows={4}
                placeholder="اكتب رسالتك…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="bc-scheduled">
                موعد الإرسال (اختياري — فارغ = الآن)
              </Label>
              <Input
                id="bc-scheduled"
                type="datetime-local"
                className="mt-1.5"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>

            {!templateId && (
              <>
                <p className="text-xs text-muted-foreground">
                  استخدم {"{{name}}"} لإدراج اسم العميل في الرسالة
                </p>
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  تنبيه: الرسائل النصية تصل فقط لعملاء تواصلوا خلال آخر ٢٤ ساعة —
                  للبث الواسع اختر قالب معتمداً
                </p>
              </>
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {result && (
              <p className="text-sm text-emerald-600">{result}</p>
            )}

            <Button
              onClick={handleLaunch}
              disabled={sending || !tag || !body.trim()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending
                ? scheduledAt
                  ? "جارٍ الجدولة…"
                  : "جارٍ الإرسال…"
                : scheduledAt
                  ? "جدولة الحملة"
                  : "إطلاق الحملة"}
            </Button>
          </div>
        )}
      </div>

      {/* سجل الحملات */}
      <div className="space-y-2">
        <h2 className="font-semibold">سجل الحملات</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد حملات بعد</p>
        ) : (
          campaigns.map((c) => {
            const status = statusConfig[c.status];
            return (
              <div key={c.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{c.tag}</Badge>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(
                      typeof c.createdAt === "string"
                        ? c.createdAt
                        : c.createdAt.toISOString()
                    )}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {c.body}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {c.sentCount}/{c.totalCount} نجاح
                  {c.failedCount > 0 && ` — ${c.failedCount} فشل`}
                </p>
                {c.scheduledAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    موعد الإرسال:{" "}
                    {new Intl.DateTimeFormat("ar", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(c.scheduledAt))}
                  </p>
                )}
                {c.status === "QUEUED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={sendingNowId === c.id}
                    onClick={() => handleSendNow(c)}
                  >
                    {sendingNowId === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    إرسال الآن
                  </Button>
                )}
                {/* شريط التقدم */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${c.totalCount > 0 ? (c.sentCount / c.totalCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
