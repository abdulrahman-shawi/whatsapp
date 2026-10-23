"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  initialSubdomain: string | null;
  initialCustomDomain: string | null;
  initialVerificationToken: string | null;
  initiallyVerified: boolean;
  appDomain: string;
};

export function WorkspaceDomainsCard({
  initialSubdomain,
  initialCustomDomain,
  initialVerificationToken,
  initiallyVerified,
  appDomain,
}: Props) {
  const [subdomain, setSubdomain] = useState(initialSubdomain ?? "");
  const [customDomain, setCustomDomain] = useState(initialCustomDomain ?? "");
  const [verificationToken, setVerificationToken] = useState(
    initialVerificationToken
  );
  const [verified, setVerified] = useState(initiallyVerified);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(payload: { subdomain?: string | null; customDomain?: string | null }) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/workspace-domain", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "تعذّر حفظ النطاق");
        return;
      }
      if ("subdomain" in data) setSubdomain(data.subdomain ?? "");
      if ("customDomain" in data) {
        setCustomDomain(data.customDomain ?? "");
        setVerificationToken(data.customDomainVerificationToken ?? null);
        setVerified(Boolean(data.customDomainVerifiedAt));
      }
      setMessage("تم الحفظ");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/workspace-domain", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "تعذّر التحقق من DNS");
        return;
      }
      setVerified(true);
      setMessage("تم التحقق من ملكية الدومين");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Label htmlFor="workspace-subdomain">نطاق مساحة العمل</Label>
        <div className="flex items-center gap-2" dir="ltr">
          <Input
            id="workspace-subdomain"
            value={subdomain}
            onChange={(event) => setSubdomain(event.target.value.toLowerCase())}
            placeholder="your-workspace"
            maxLength={63}
          />
          <span className="shrink-0 text-sm text-muted-foreground">
            .{appDomain}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          احفظ اسماً فريداً لفتح لوحة مساحة العمل من نطاقها. يجب أن يشير wildcard DNS
          ومضيف التطبيق إلى هذا النطاق.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => save({ subdomain: subdomain.trim() || null })}
        >
          حفظ النطاق الفرعي
        </Button>
      </div>

      <div className="space-y-2 border-t pt-5">
        <Label htmlFor="workspace-custom-domain">دومين العميل</Label>
        <Input
          id="workspace-custom-domain"
          value={customDomain}
          onChange={(event) => setCustomDomain(event.target.value.toLowerCase())}
          placeholder="support.example.com"
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground">
          بعد حفظ الدومين، أضف سجل TXT الموضح أدناه للتحقق من الملكية. يلزم أيضاً
          توجيه DNS وشهادة TLS من مزود الاستضافة؛ هذه الإعدادات لا تُنشأ تلقائياً.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => save({ customDomain: customDomain.trim() || null })}
          >
            حفظ الدومين
          </Button>
          {customDomain && (
            <Button type="button" disabled={busy || verified} onClick={verify}>
              {verified ? "تم التحقق" : "تحقق من سجل DNS"}
            </Button>
          )}
        </div>
        {customDomain && verificationToken && !verified && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p>أضف سجل TXT:</p>
            <p className="mt-1 font-mono" dir="ltr">
              الاسم: radd-verification.{customDomain}
            </p>
            <p className="font-mono break-all" dir="ltr">
              القيمة: radd-verification={verificationToken}
            </p>
          </div>
        )}
        {verified && (
          <p className="text-sm text-emerald-700">
            تم التحقق. سيوجّه التطبيق طلبات هذا المضيف إلى مساحة العمل بعد إعداد
            DNS وTLS لدى مزود الاستضافة.
          </p>
        )}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
    </div>
  );
}
