"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntegrationInfo, IntegrationKey } from "@/lib/settings";

type ChannelId = "whatsapp" | "telegram" | "widget";
type WhatsAppProvider = "meta" | "ultramsg";
type TelegramConnection = {
  configured: boolean;
  connected: boolean;
  username?: string | null;
  webhookUrl?: string | null;
  pendingUpdates?: number;
  error?: string | null;
};

const CHANNEL_KEYS: Record<Exclude<ChannelId, "widget">, IntegrationKey[]> = {
  whatsapp: [
    "WHATSAPP_TOKEN",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "META_APP_SECRET",
    "ULTRAMSG_INSTANCE_ID",
    "ULTRAMSG_TOKEN",
  ],
  telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"],
};

const META_KEYS = CHANNEL_KEYS.whatsapp.slice(0, 4);
const ULTRAMSG_KEYS = CHANNEL_KEYS.whatsapp.slice(4);

// قنوات الاتصال: كل قناة تفتح نموذجاً مستقلاً، والحقل الفارغ يبقي القيمة الحالية.
export function IntegrationsForm({
  integrations: initialIntegrations,
}: {
  integrations: IntegrationInfo[];
}) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [activeChannel, setActiveChannel] = useState<ChannelId | null>(null);
  const [provider, setProvider] = useState<WhatsAppProvider>("meta");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [telegramConnection, setTelegramConnection] =
    useState<TelegramConnection | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (activeChannel && dialog && !dialog.open) dialog.showModal();
  }, [activeChannel]);

  useEffect(() => {
    if (activeChannel !== "telegram") return;
    let cancelled = false;
    setConnectionLoading(true);
    fetch("/api/settings/integrations/telegram", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "تعذّر فحص الاتصال");
        if (!cancelled && data?.connection) {
          setTelegramConnection(data.connection);
        }
      })
      .catch((statusError: unknown) => {
        if (!cancelled) {
          setTelegramConnection(null);
          setError(
            statusError instanceof Error
              ? statusError.message
              : "تعذّر فحص اتصال تيليجرام"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setConnectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeChannel]);

  function openChannel(channel: ChannelId) {
    setDraft({});
    setCleared({});
    setVisible({});
    setSaving(false);
    setSaved(false);
    setError("");
    setActiveChannel(channel);
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function getItem(key: IntegrationKey) {
    return integrations.find((item) => item.key === key);
  }

  function hasValue(key: IntegrationKey) {
    return Boolean(getItem(key)?.source);
  }

  function hasCompleteWhatsAppSetup() {
    return META_KEYS.every(hasValue) || ULTRAMSG_KEYS.every(hasValue);
  }

  function channelStatus(channel: ChannelId) {
    if (channel === "widget") return <Badge variant="secondary">لا تحتاج مفاتيح</Badge>;
    if (channel === "telegram") {
      if (telegramConnection?.connected) {
        return <Badge variant="success">متصل</Badge>;
      }
      if (hasValue("TELEGRAM_BOT_TOKEN")) {
        return telegramConnection?.configured ? (
          <Badge variant="secondary">يلزم الاتصال</Badge>
        ) : (
          <Badge variant="secondary">بيانات محفوظة</Badge>
        );
      }
      return <Badge variant="outline">لم تُضف بيانات</Badge>;
    }
    if (hasCompleteWhatsAppSetup()) return <Badge variant="success">بيانات محفوظة</Badge>;
    return CHANNEL_KEYS.whatsapp.some(hasValue) ? (
      <Badge variant="secondary">الإعداد غير مكتمل</Badge>
    ) : (
      <Badge variant="outline">لم تُضف بيانات</Badge>
    );
  }

  function sourceBadge(source: IntegrationInfo["source"]) {
    return source === "db" ? (
      <Badge variant="default">محفوظ لمساحة العمل</Badge>
    ) : source === "env" ? (
      <Badge variant="secondary">من إعدادات الخادم</Badge>
    ) : (
      <Badge variant="outline">غير مضبوط</Badge>
    );
  }

  function updateDraft(key: IntegrationKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setCleared((current) => ({ ...current, [key]: false }));
    if (key.startsWith("TELEGRAM")) {
      setTelegramConnection({
        configured: hasValue("TELEGRAM_BOT_TOKEN"),
        connected: false,
      });
    }
    setSaved(false);
    setError("");
  }

  function clearKey(key: IntegrationKey) {
    setDraft((current) => ({ ...current, [key]: "" }));
    setCleared((current) => ({ ...current, [key]: true }));
    if (key.startsWith("TELEGRAM")) {
      setTelegramConnection({ configured: false, connected: false });
    }
    setSaved(false);
  }

  function undoClear(key: IntegrationKey) {
    setDraft((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setCleared((current) => ({ ...current, [key]: false }));
  }

  function renderField(
    key: IntegrationKey,
    options?: { description?: string; placeholder?: string; optional?: boolean }
  ) {
    const item = getItem(key);
    if (!item) return null;
    const isVisible = visible[key];
    const isCleared = cleared[key];

    return (
      <div key={key} className="space-y-2 border-b pb-5 last:border-b-0 last:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={`channel-key-${key}`}>
            {item.label}
            {options?.optional && (
              <span className="mr-1 font-normal text-muted-foreground">(اختياري)</span>
            )}
          </Label>
          {isCleared ? <Badge variant="outline">سيُحذف عند الحفظ</Badge> : sourceBadge(item.source)}
        </div>
        {(item.masked || item.value) && !isCleared && (
          <p className="text-xs text-muted-foreground" dir="ltr">{item.masked ?? item.value}</p>
        )}
        <div className="relative">
          <Input
            id={`channel-key-${key}`}
            type={item.secret && !isVisible ? "password" : "text"}
            dir="ltr"
            className="text-left pl-11"
            placeholder={options?.placeholder ?? ""}
            value={draft[key] ?? ""}
            onChange={(event) => updateDraft(key, event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={options?.description ? `channel-help-${key}` : undefined}
          />
          {item.secret && (
            <button
              type="button"
              className="absolute left-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setVisible((current) => ({ ...current, [key]: !current[key] }))}
              aria-label={isVisible ? `إخفاء ${item.label}` : `إظهار ${item.label}`}
            >
              {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id={`channel-help-${key}`} className="text-xs leading-5 text-muted-foreground">
            {options?.description ?? "اترك الحقل فارغاً للإبقاء على القيمة الحالية."}
          </p>
          {item.source === "db" && !isCleared && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => clearKey(key)}
            >
              <Eraser className="h-4 w-4" />
              مسح المحفوظ
            </Button>
          )}
          {isCleared && (
            <Button type="button" variant="ghost" size="sm" onClick={() => undoClear(key)}>تراجع</Button>
          )}
        </div>
      </div>
    );
  }

  const dirty = Object.entries(draft).some(([key, value]) => value !== "" || cleared[key]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(draft)) {
      if (value !== "" || cleared[key]) payload[key] = value;
    }
    if (Object.keys(payload).length === 0 || saving) return;

    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/settings/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "حدث خطأ أثناء الحفظ");
      if (Array.isArray(data?.integrations)) setIntegrations(data.integrations);
      if (activeChannel === "telegram") {
        const items = Array.isArray(data?.integrations)
          ? (data.integrations as IntegrationInfo[])
          : integrations;
        setTelegramConnection({
          configured: Boolean(
            items.find((item) => item.key === "TELEGRAM_BOT_TOKEN")?.source
          ),
          connected: false,
        });
      }
      setDraft({});
      setCleared({});
      setVisible({});
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذّر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  async function handleTelegramConnect() {
    if (connecting || saving || dirty || !hasValue("TELEGRAM_BOT_TOKEN")) return;
    setConnecting(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/settings/integrations/telegram", {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "تعذّر تسجيل Webhook تيليجرام");
      }
      if (Array.isArray(data?.integrations)) setIntegrations(data.integrations);
      if (data?.connection) setTelegramConnection(data.connection);
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "تعذّر الاتصال بتيليجرام"
      );
    } finally {
      setConnecting(false);
    }
  }

  const channels = [
    {
      id: "whatsapp" as const,
      title: "واتساب",
      description: "اربط رقم نشاطك عبر Meta Cloud API أو UltraMsg.",
      icon: MessageCircle,
      action: "إعداد واتساب",
    },
    {
      id: "telegram" as const,
      title: "تيليجرام",
      description: "أضف توكن البوت وسر الويب هوك لاستقبال رسائل عملائك.",
      icon: Send,
      action: "إعداد تيليجرام",
    },
    {
      id: "widget" as const,
      title: "ودجت / نافذة منبثقة",
      description: "أضف محادثة ذكية إلى موقعك وخصّص مظهرها ورسالة الترحيب.",
      icon: Globe,
      action: "إعداد قناة الموقع",
    },
  ];

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        {channels.map((channel) => {
          const Icon = channel.icon;
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => openChannel(channel.id)}
              className="group flex min-h-52 flex-col items-start rounded-2xl border bg-card p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-0"
              aria-haspopup="dialog"
              aria-controls="channel-settings-dialog"
            >
              <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
              <span className="mt-4 text-base font-bold">{channel.title}</span>
              <span className="mt-1.5 text-sm leading-6 text-muted-foreground">{channel.description}</span>
              <span className="mt-auto flex w-full items-center justify-between gap-2 pt-5">
                {channelStatus(channel.id)}
                <ArrowLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-1" />
              </span>
              <span className="sr-only">{channel.action}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        تُحفظ بيانات كل قناة على حدة. لا يعني ظهور «بيانات محفوظة» أن القناة متصلة؛ يعتمد الاتصال أيضاً على إعداد الويب هوك لدى المزوّد.
      </p>

      <dialog
        ref={dialogRef}
        id="channel-settings-dialog"
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-slate-950/55 backdrop:backdrop-blur-sm"
        aria-labelledby="channel-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => {
          setActiveChannel(null);
          setDraft({});
          setCleared({});
          setVisible({});
          setError("");
          setSaved(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        {activeChannel && (
          <div className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b pb-5">
              <div>
                <h3 id="channel-dialog-title" className="text-xl font-bold">
                  {channels.find((channel) => channel.id === activeChannel)?.title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {activeChannel === "whatsapp" && "أدخل بيانات المزوّد الذي تستخدمه لإدارة رسائل واتساب."}
                  {activeChannel === "telegram" && "انسخ توكن البوت من BotFather، احفظه، ثم اضغط «اتصال واختبار القناة»."}
                  {activeChannel === "widget" && "لا تحتاج قناة الموقع إلى مفاتيح سرية؛ كل ما تحتاجه هو كود التضمين."}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeDialog} aria-label="إغلاق النافذة">
                <X className="h-5 w-5" />
              </Button>
            </div>

            {activeChannel === "widget" ? (
              <div className="pt-6">
                <p className="text-sm leading-7 text-muted-foreground">
                  اختر الوكيل، خصّص ألوان الودجت ورسالة الترحيب، ثم انسخ كود التضمين إلى موقعك. يظهر للزائر كزر محادثة يفتح نافذة منبثقة.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/widget" onClick={closeDialog}>
                      فتح إعدادات الودجت
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" onClick={closeDialog}>إغلاق</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="pt-6">
                {activeChannel === "whatsapp" && (
                  <>
                    <div className="mb-6 grid grid-cols-2 rounded-2xl bg-muted p-1" role="tablist" aria-label="مزوّد واتساب">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={provider === "meta"}
                        onClick={() => setProvider("meta")}
                        className={`min-h-11 rounded-xl px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${provider === "meta" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        Meta Cloud API
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={provider === "ultramsg"}
                        onClick={() => setProvider("ultramsg")}
                        className={`min-h-11 rounded-xl px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${provider === "ultramsg" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        UltraMsg
                      </button>
                    </div>
                    <div className="space-y-5" role="tabpanel">
                      {provider === "meta" ? (
                        <>
                          {renderField("WHATSAPP_TOKEN", { description: "رمز الوصول الدائم من إعدادات Meta للمطورين." })}
                          {renderField("WHATSAPP_PHONE_NUMBER_ID", { description: "معرّف رقم الهاتف، وليس رقم الهاتف نفسه.", placeholder: "123456789012345" })}
                          {renderField("WHATSAPP_VERIFY_TOKEN", { description: "قيمة تختارها وتطابقها في إعداد Webhook لدى Meta." })}
                          {renderField("META_APP_SECRET", { description: "سر التطبيق المستخدم للتحقق من توقيع طلبات الويب هوك." })}
                        </>
                      ) : (
                        <>
                          {renderField("ULTRAMSG_INSTANCE_ID", { description: "معرّف النسخة الظاهر في لوحة UltraMsg.", placeholder: "instance12345" })}
                          {renderField("ULTRAMSG_TOKEN", { description: "التوكن الخاص بالنسخة من لوحة UltraMsg." })}
                        </>
                      )}
                    </div>
                  </>
                )}

                {activeChannel === "telegram" && (
                  <div className="space-y-5">
                    {renderField("TELEGRAM_BOT_TOKEN", {
                      description: "التوكن الذي يرسله BotFather عند إنشاء البوت.",
                      placeholder: "123456789:AA...",
                    })}
                    {renderField("TELEGRAM_WEBHOOK_SECRET", {
                      description: "اتركه فارغاً ليُنشأ سر قوي تلقائياً عند الاتصال.",
                      optional: true,
                    })}
                    <div className="rounded-2xl border bg-muted/40 p-4" aria-live="polite">
                      {connectionLoading ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          جارٍ فحص اتصال تيليجرام…
                        </p>
                      ) : telegramConnection?.connected ? (
                        <div className="space-y-1">
                          <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                            <Check className="h-4 w-4" />
                            القناة متصلة وجاهزة لاستقبال الرسائل
                            {telegramConnection.username ? ` @${telegramConnection.username}` : ""}
                          </p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            أرسل الآن رسالة إلى البوت من تيليجرام؛ ستظهر في صندوق الوارد.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs leading-5 text-muted-foreground">
                          حفظ التوكن وحده لا يستقبل الرسائل. بعد الحفظ اضغط «اتصال واختبار القناة» لتسجيل Webhook.
                        </p>
                      )}
                      {telegramConnection?.error && !telegramConnection.connected && (
                        <p className="mt-2 text-xs leading-5 text-destructive">
                          آخر خطأ لدى تيليجرام: {telegramConnection.error}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <p className="mt-5 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>
                )}
                {saved && (
                  <p className="mt-5 rounded-xl bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700" role="status">
                    {activeChannel === "telegram"
                      ? "تم حفظ البيانات. اضغط الآن «اتصال واختبار القناة»."
                      : "تم حفظ بيانات القناة بنجاح."}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
                  <Button type="submit" disabled={!dirty || saving || connecting}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                    {saving ? "جارٍ الحفظ…" : saved ? "تم الحفظ" : "حفظ بيانات القناة"}
                  </Button>
                  {activeChannel === "telegram" && (
                    <Button
                      type="button"
                      variant={telegramConnection?.connected ? "outline" : "default"}
                      onClick={handleTelegramConnect}
                      disabled={
                        !hasValue("TELEGRAM_BOT_TOKEN") || dirty || saving || connecting
                      }
                      title={dirty ? "احفظ التعديلات أولاً" : undefined}
                    >
                      {connecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : telegramConnection?.connected ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {connecting
                        ? "جارٍ تسجيل Webhook…"
                        : telegramConnection?.connected
                          ? "إعادة اختبار الاتصال"
                          : "اتصال واختبار القناة"}
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={closeDialog} disabled={saving || connecting}>إغلاق</Button>
                </div>
              </form>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
