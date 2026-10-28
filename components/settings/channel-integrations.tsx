"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CircleAlert, Loader2, Plug, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntegrationInfo } from "@/lib/settings";

type ChannelKey =
  | "WHATSAPP_TOKEN"
  | "WHATSAPP_VERIFY_TOKEN"
  | "WHATSAPP_PHONE_NUMBER_ID"
  | "META_APP_SECRET"
  | "ULTRAMSG_INSTANCE_ID"
  | "ULTRAMSG_TOKEN"
  | "TELEGRAM_BOT_TOKEN"
  | "TELEGRAM_CHAT_ID"
  | "WIDGET_API_KEY"
  | "WIDGET_APP_ID"
  | "PUSHER_APP_ID"
  | "PUSHER_KEY"
  | "PUSHER_SECRET"
  | "PUSHER_CLUSTER";

type Channel = {
  id: "whatsapp" | "telegram" | "widget";
  title: string;
  description: string;
  cta: string;
  testLabel: string;
  fields: {
    key: ChannelKey;
    label: string;
    secret: boolean;
    placeholder: string;
    required?: boolean;
  }[];
};

const CHANNELS: Channel[] = [
  {
    id: "whatsapp",
    title: "واتساب",
    description: "اربط حساب واتساب عبر Meta Cloud API أو UltraMsg.",
    cta: "اختبار واتساب",
    testLabel: "اختبار الاتصال بواتساب",
    fields: [
      { key: "WHATSAPP_TOKEN", label: "توكن واتساب", secret: true, placeholder: "EAAG...", required: true },
      { key: "WHATSAPP_PHONE_NUMBER_ID", label: "معرّف رقم واتساب", secret: false, placeholder: "1234567890", required: true },
      { key: "META_APP_SECRET", label: "سر تطبيق Meta", secret: true, placeholder: "app secret", required: true },
      { key: "WHATSAPP_VERIFY_TOKEN", label: "توكن التحقق من الويب هوك", secret: true, placeholder: "verify token" },
      { key: "ULTRAMSG_INSTANCE_ID", label: "معرّف نسخة UltraMsg", secret: false, placeholder: "instance id" },
      { key: "ULTRAMSG_TOKEN", label: "توكن UltraMsg", secret: true, placeholder: "ultramsg token" },
    ],
  },
  {
    id: "telegram",
    title: "تيليجرام",
    description: "اربط بوت تيليجرام وحدد المحادثة أو المجموعة المستهدفة.",
    cta: "اختبار تيليجرام",
    testLabel: "اختبار الاتصال بتيليجرام",
    fields: [
      { key: "TELEGRAM_BOT_TOKEN", label: "توكن البوت", secret: true, placeholder: "123456:ABC-DEF...", required: true },
      { key: "TELEGRAM_CHAT_ID", label: "معرّف المحادثة أو المجموعة", secret: false, placeholder: "@channel أو -100...", required: true },
    ],
  },
  {
    id: "widget",
    title: "ودجت / نافذة منبثقة",
    description: "أضف كود الويدجت إلى موقعك ثم اختبر الاتصال والمظهر.",
    cta: "اختبار الويدجت",
    testLabel: "اختبار اتصال الويدجت",
    fields: [
      { key: "WIDGET_API_KEY", label: "مفتاح API للويدجت", secret: true, placeholder: "widget api key", required: true },
      { key: "WIDGET_APP_ID", label: "معرّف التطبيق أو الموقع", secret: false, placeholder: "app id / domain", required: true },
    ],
  },
];

export function ChannelIntegrations({
  integrations,
}: {
  integrations: IntegrationInfo[];
}) {
  const [openChannel, setOpenChannel] = useState<Channel["id"] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string } | null>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const byKey = useMemo(
    () => new Map(integrations.map((item) => [item.key, item])),
    [integrations]
  );

  useEffect(() => {
    setSaveMessage(null);
  }, [draft]);

  function currentValue(key: ChannelKey) {
    return draft[key] ?? byKey.get(key)?.value ?? byKey.get(key)?.masked ?? "";
  }

  function statusFor(channel: Channel) {
    const configured = channel.fields.filter((field) => {
      const info = byKey.get(field.key);
      return Boolean(info?.value || info?.masked);
    }).length;
    const required = channel.fields.filter((field) => field.required).length;
    if (configured === 0) return { label: "غير مضبوط", variant: "outline" as const };
    if (required > 0 && configured < required) return { label: "غير مكتمل", variant: "warning" as const };
    return { label: "جاهز للاختبار", variant: "success" as const };
  }

  async function handleTest(channel: Channel) {
    const payload: Record<string, string> = {};
    for (const field of channel.fields) {
      const value = currentValue(field.key).trim();
      if (value) payload[field.key] = value;
    }
    setTesting((prev) => ({ ...prev, [channel.id]: true }));
    setResults((prev) => ({ ...prev, [channel.id]: null }));
    try {
      const res = await fetch("/api/settings/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channel.id, values: payload }),
      });
      const data = await res.json().catch(() => null);
      setResults((prev) => ({
        ...prev,
        [channel.id]: {
          ok: res.ok && Boolean(data?.ok),
          message: data?.message ?? (res.ok ? "تم الاختبار بنجاح" : "تعذّر الاختبار"),
        },
      }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [channel.id]: { ok: false, message: "تعذّر الوصول إلى خادم الاختبار" },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [channel.id]: false }));
    }
  }

  async function handleSave(channel: Channel) {
    const payload: Record<string, string> = {};
    for (const field of channel.fields) {
      const value = currentValue(field.key).trim();
      if (value) payload[field.key] = value;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "تعذّر الحفظ");
      setSaveMessage("تم حفظ الإعدادات — أصبحت فعّالة فوراً");
      setOpenChannel(null);
      window.location.reload();
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {CHANNELS.map((channel) => {
        const status = statusFor(channel);
        const result = results[channel.id];
        return (
          <div key={channel.id} className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                    <Plug className="h-4 w-4" />
                  </span>
                  <div>
                    <h4 className="text-base font-semibold">{channel.title}</h4>
                    <p className="text-sm text-muted-foreground">{channel.description}</p>
                  </div>
                </div>
              </div>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {channel.fields.map((field) => {
                const info = byKey.get(field.key);
                const value = currentValue(field.key);
                return (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`${channel.id}-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`${channel.id}-${field.key}`}
                      type={field.secret ? "password" : "text"}
                      dir="ltr"
                      className="text-left"
                      placeholder={field.placeholder}
                      value={value}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                    />
                    {info?.source === "db" ? (
                      <p className="text-xs text-muted-foreground">محفوظ في قاعدة البيانات</p>
                    ) : info?.source === "env" ? (
                      <p className="text-xs text-muted-foreground">من .env</p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setOpenChannel(openChannel === channel.id ? null : channel.id)}
              >
                <Radio className="h-4 w-4" />
                {channel.cta}
              </Button>
              <Button onClick={() => handleSave(channel)} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ الإعدادات
              </Button>
            </div>

            {openChannel === channel.id && (
              <div className="mt-4 rounded-2xl border bg-background/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">{channel.testLabel}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenChannel(null)}
                    className="text-muted-foreground"
                  >
                    إغلاق
                  </Button>
                </div>
                <div className="space-y-3">
                  {channel.fields
                    .filter((field) => field.required)
                    .map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={`test-${channel.id}-${field.key}`}>{field.label}</Label>
                        <Input
                          id={`test-${channel.id}-${field.key}`}
                          type={field.secret ? "password" : "text"}
                          dir="ltr"
                          className="text-left"
                          placeholder={field.placeholder}
                          value={currentValue(field.key)}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleTest(channel)}
                      disabled={testing[channel.id]}
                    >
                      {testing[channel.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <BadgeCheck className="h-4 w-4" />
                      )}
                      {testing[channel.id] ? "جارٍ الاختبار…" : "تشغيل الاختبار"}
                    </Button>
                    {result && (
                      <span
                        className={`inline-flex items-center gap-1 text-sm ${
                          result.ok ? "text-emerald-600" : "text-destructive"
                        }`}
                      >
                        {result.ok ? <BadgeCheck className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
                        {result.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {saveMessage && (
        <p className="md:col-span-2 xl:col-span-3 text-sm text-muted-foreground" role="status">
          {saveMessage}
        </p>
      )}
    </div>
  );
}
