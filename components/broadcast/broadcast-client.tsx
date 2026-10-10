"use client";

import { useState } from "react";
import { Loader2, Megaphone, MousePointerClick, Send, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/time";
import { CONTACT_STAGES } from "@/lib/contact-stages";
import type { TemplateInfo } from "@/components/inbox/types";

type Campaign = {
  id: string;
  tag: string;
  body: string;
  bodyB?: string | null;
  linkUrlB?: string | null;
  status: "QUEUED" | "SENDING" | "SENT" | "PARTIAL" | "FAILED";
  totalCount: number;
  sentCount: number;
  failedCount: number;
  sentCountB: number;
  failedCountB: number;
  clickCount: number;
  clickCountA: number;
  clickCountB: number;
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

// حملات البث الجماعي: إنشاء حملة باستهداف مركّب (تسميات + مرحلة + خمول) مع سجل النتائج والنقرات
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
  // الاستهداف المركّب: عدة تسميات + مرحلة + خمول (لم يتفاعل منذ N يوم — استعادة العملاء)
  const [selectedTags, setSelectedTags] = useState<string[]>(tags[0] ? [tags[0]] : []);
  const [stage, setStage] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [audiencePreview, setAudiencePreview] = useState<{
    count: number;
    capped: boolean;
    totalContacts: number;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [bodyB, setBodyB] = useState("");
  const [linkUrlB, setLinkUrlB] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);

  // هل حُدد معيار استهداف واحد على الأقل؟
  const hasCriterion =
    selectedTags.length > 0 || stage !== "" || Number(inactiveDays) > 0;

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
        audience: {
          tags: selectedTags,
          stage: stage || null,
          inactiveDays: Number(inactiveDays) > 0 ? Number(inactiveDays) : null,
        },
        linkUrl: linkUrl.trim() || null,
        body,
        bodyB: bodyB.trim() || null,
        linkUrlB: linkUrlB.trim() || null,
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
    setCampaigns((prev) => [{ ...data.campaign, clickCount: 0 }, ...prev]);
    setResult(
      data.campaign.status === "QUEUED"
        ? "تمت جدولة الحملة"
        : data.campaign.bodyB
          ? `أُرسلت الحملة: A — ${data.campaign.sentCount} نجاح و${data.campaign.failedCount} فشل، B — ${data.campaign.sentCountB} نجاح و${data.campaign.failedCountB} فشل`
          : `أُرسلت الحملة: ${data.campaign.sentCount} نجاح، ${data.campaign.failedCount} فشل`
    );
    setBody("");
    setBodyB("");
    setLinkUrlB("");
    setTemplateId("");
    setParams([]);
    setScheduledAt("");
    setAudiencePreview(null);
  }

  // معاينة حجم الجمهور بالمعايير الحالية — نفس شرط الاستعلام المستعمل فعلياً
  async function handlePreviewAudience() {
    setPreviewing(true);
    setAudiencePreview(null);
    setError("");
    const qs = new URLSearchParams({ audience: "1" });
    if (selectedTags.length > 0) qs.set("tags", selectedTags.join(","));
    if (stage) qs.set("stage", stage);
    if (Number(inactiveDays) > 0) qs.set("inactiveDays", inactiveDays);
    const res = await fetch(`/api/broadcasts?${qs.toString()}`);
    const data = await res.json().catch(() => null);
    setPreviewing(false);
    if (!res.ok) {
      setError(data?.error ?? "تعذرت معاينة الجمهور");
      return;
    }
    setAudiencePreview(data);
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

        {tags.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            لا توجد تسميات بعد — يمكنك الاستهداف بالمرحلة أو الخمول، وأضف
            تسميات لجهات الاتصال من لوحة جهة الاتصال في صندوق الوارد
          </p>
        )}
        <div className="space-y-3">
          <div>
            <Label>جمهور الحملة (معايير الاستهداف)</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  لا تسميات متاحة
                </span>
              ) : (
                tags.map((t) => {
                  const checked = selectedTags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setSelectedTags((prev) =>
                          checked
                            ? prev.filter((x) => x !== t)
                            : [...prev, t]
                        );
                        setAudiencePreview(null);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bc-stage">مرحلة العميل</Label>
              <select
                id="bc-stage"
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  setAudiencePreview(null);
                }}
                className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">الكل</option>
                {CONTACT_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="bc-inactive">
                لم يتفاعل منذ (أيام — فارغ = بلا شرط)
              </Label>
              <Input
                id="bc-inactive"
                type="number"
                min={0}
                className="mt-1.5"
                placeholder="مثال: 30 — لاستعادة العملاء الخاملين"
                value={inactiveDays}
                onChange={(e) => {
                  setInactiveDays(e.target.value);
                  setAudiencePreview(null);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={previewing || !hasCriterion}
              onClick={handlePreviewAudience}
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              عرض حجم الجمهور
            </Button>
            {audiencePreview && (
              <span
                className={`text-sm ${
                  audiencePreview.count === 0
                    ? "text-destructive"
                    : audiencePreview.capped
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}
              >
                {audiencePreview.count === 0
                  ? "لا يوجد جمهور يطابق المعايير"
                  : `${audiencePreview.count} عميل${audiencePreview.capped ? " — يتجاوز الحد الأقصى (500)" : ` من أصل ${audiencePreview.totalContacts}`}`}
              </span>
            )}
          </div>

          <div>
            <Label htmlFor="bc-link">رابط العرض (اختياري — لتتبّع النقرات)</Label>
            <Input
              id="bc-link"
              dir="ltr"
              className="mt-1.5"
              placeholder="https://example.com/offer"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              ضع {"{{link}}"} في نص الرسالة وسيتحول لرابط تتبّع لكل عميل
            </p>
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

          <div className="rounded-md border border-dashed p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              اختبار A/B (اختياري): عبّئة نسخة B لإرسالها لنصف الجمهور
              ومقارنة النتائج
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="bc-body-b">نص نسخة B</Label>
                <Textarea
                  id="bc-body-b"
                  rows={3}
                  placeholder="نص بديل… — اتركه فارغاً لإرسال النسخة A للجميع"
                  value={bodyB}
                  onChange={(e) => setBodyB(e.target.value)}
                />
              </div>
              {bodyB.trim() && (
                <div>
                  <Label htmlFor="bc-link-b">
                    رابط عرض نسخة B (اختياري — يتجاوز رابط النسخة A)
                  </Label>
                  <Input
                    id="bc-link-b"
                    dir="ltr"
                    className="mt-1.5"
                    placeholder="https://example.com/offer-b"
                    value={linkUrlB}
                    onChange={(e) => setLinkUrlB(e.target.value)}
                  />
                </div>
              )}
            </div>
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
                استخدم {"{{name}}"} لإدراج اسم العميل و{"{{link}}"} لإدراج رابط
                العرض في الرسالة
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
            disabled={sending || !hasCriterion || !body.trim()}
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
                  {c.sentCount + c.sentCountB}/{c.totalCount} نجاح
                  {c.failedCount + c.failedCountB > 0 &&
                    ` — ${c.failedCount + c.failedCountB} فشل`}
                  {" — "}
                  <span className="inline-flex items-center gap-1">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    {c.clickCount} نقرة
                    {c.sentCount + c.sentCountB > 0 &&
                      ` — نسبة النقر ${((c.clickCount / (c.sentCount + c.sentCountB)) * 100).toFixed(1)}٪`}
                  </span>
                </p>
                {(c.bodyB || c.sentCountB + c.failedCountB > 0) && (
                  <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
                    <p className="font-medium">مقارنة اختبار A/B:</p>
                    <p className="flex flex-wrap gap-x-4">
                      <span>
                        <span className="font-semibold">A:</span> وصل{" "}
                        {c.sentCount} — فشل {c.failedCount} —{" "}
                        {c.clickCountA} نقرة
                        {c.sentCount > 0 &&
                          ` (${((c.clickCountA / c.sentCount) * 100).toFixed(1)}٪)`}
                      </span>
                      <span>
                        <span className="font-semibold">B:</span> وصل{" "}
                        {c.sentCountB} — فشل {c.failedCountB} —{" "}
                        {c.clickCountB} نقرة
                        {c.sentCountB > 0 &&
                          ` (${((c.clickCountB / c.sentCountB) * 100).toFixed(1)}٪)`}
                      </span>
                    </p>
                  </div>
                )}
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
                      width: `${c.totalCount > 0 ? ((c.sentCount + c.sentCountB) / c.totalCount) * 100 : 0}%`,
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
