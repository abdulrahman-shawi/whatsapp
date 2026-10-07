"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeadFormField } from "@/lib/lead-forms";

type Props = {
  formId: string;
  title: string;
  description: string | null;
  workspaceName: string;
  fields: LeadFormField[];
};

// عرض النموذج العام للزائر: تحقق إلزامي قبل الإرسال ورسالة نجاح بعده
export function LeadFormView({
  formId,
  title,
  description,
  workspaceName,
  fields,
}: Props) {
  const [values, setValues] = useState<string[]>(fields.map(() => ""));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].required && !values[i].trim()) {
        setError(`الحقل "${fields[i].label}" مطلوب`);
        return;
      }
    }
    setSending(true);
    setError("");
    const res = await fetch(`/api/forms/${formId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء الإرسال — حاول مجدداً");
      return;
    }
    setDone(true);
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-10"
    >
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {description}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{workspaceName}</p>

        {done ? (
          <div className="py-10 text-center">
            <p className="text-3xl">🌟</p>
            <p className="mt-3 font-semibold">
              تم استلام طلبك، سنتواصل معك قريباً 🌟
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {fields.map((f, i) => (
              <div key={i}>
                <Label htmlFor={`lf-${i}`}>
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={`lf-${i}`}
                    rows={4}
                    className="mt-1.5"
                    value={values[i]}
                    onChange={(e) =>
                      setValues((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                  />
                ) : (
                  <Input
                    id={`lf-${i}`}
                    type={f.type === "phone" ? "tel" : "text"}
                    dir={f.type === "phone" ? "ltr" : undefined}
                    className={`mt-1.5 ${f.type === "phone" ? "text-left" : ""}`}
                    value={values[i]}
                    onChange={(e) =>
                      setValues((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                  />
                )}
              </div>
            ))}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" disabled={sending} className="w-full">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? "جارٍ الإرسال…" : "إرسال"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
