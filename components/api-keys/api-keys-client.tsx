"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { relativeTime } from "@/lib/time";

export type ApiKeyItem = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type FreshKey = { id: string; name: string; prefix: string; key: string };

// إدارة مفاتيح API: عرض، إنشاء، وإلغاء — التعديلات عبر /api/apikeys
export function ApiKeysClient({ initialKeys }: { initialKeys: ApiKeyItem[] }) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [freshKey, setFreshKey] = useState<FreshKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/apikeys", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys ?? []);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError("");
    const res = await fetch("/api/apikeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء إنشاء المفتاح");
      return;
    }
    const data = await res.json();
    setFreshKey(data.key);
    setShowDialog(false);
    setName("");
    await reload();
  }

  async function handleRevoke(item: ApiKeyItem) {
    if (
      !window.confirm(
        `إلغاء المفتاح "${item.name}"؟ لا يمكن التراجع عن هذا الإجراء وسيتوقف كل استخدام فوراً.`
      )
    )
      return;
    setBusyId(item.id);
    setError("");
    const res = await fetch(`/api/apikeys/${item.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء إلغاء المفتاح");
      return;
    }
    await reload();
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // تجاهل فشل النسخ
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">مفاتيح API</h1>
            <p className="text-sm text-muted-foreground">
              وصول برمجي بالقراءة فقط لبيانات مساحة العمل
            </p>
          </div>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4" />
          إنشاء مفتاح
        </Button>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold">كيفية الاستخدام</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          أرسل المفتاح في ترويسة{" "}
          <code className="rounded bg-muted px-1">Authorization</code> مع كل
          طلب:
        </p>
        <pre dir="ltr" className="overflow-x-auto rounded-md bg-muted p-3 text-left text-sm">
{`curl -H "Authorization: Bearer fk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  https://your-domain.com/api/v1/contacts`}
        </pre>
      </Card>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {freshKey && (
        <Card className="border-emerald-200 bg-emerald-50 p-4">
          <h2 className="mb-2 font-semibold text-emerald-800">
            تم إنشاء المفتاح — احفظه الآن
          </h2>
          <p className="mb-3 text-sm text-emerald-700">
            لن يُعرض هذا المفتاح مرة أخرى — انسخه واحتفظ به في مكان آمن.
          </p>
          <div
            dir="ltr"
            className="mb-3 flex items-center justify-between gap-2 rounded-md bg-white p-3"
          >
            <code className="break-all text-left text-sm">{freshKey.key}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyText(freshKey.key)}
            >
              <Copy className="h-4 w-4" />
              {copied ? "تم النسخ" : "نسخ"}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setFreshKey(null)}>
            إخفاء
          </Button>
        </Card>
      )}

      {showDialog && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">إنشاء مفتاح جديد</h2>
          <div className="mb-3 space-y-2">
            <Label htmlFor="key-name">اسم المفتاح</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: تكامل التقارير"
              maxLength={60}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              إنشاء
            </Button>
            <Button variant="ghost" onClick={() => setShowDialog(false)}>
              إلغاء
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right text-muted-foreground">
                <th className="p-3 font-medium">الاسم</th>
                <th className="p-3 font-medium">المفتاح</th>
                <th className="p-3 font-medium">الحالة</th>
                <th className="p-3 font-medium">آخر استخدام</th>
                <th className="p-3 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    لا توجد مفاتيح بعد — أنشئ أول مفتاح للبدء
                  </td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{k.name}</td>
                  <td className="p-3">
                    <span dir="ltr" className="font-mono text-xs">
                      {k.prefix}••••
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ms-2"
                      title="نسخ البادئة"
                      onClick={() => copyText(k.prefix)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                  <td className="p-3">
                    {k.revokedAt ? (
                      <Badge variant="secondary">ملغى</Badge>
                    ) : (
                      <Badge variant="success">نشط</Badge>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {k.lastUsedAt ? relativeTime(k.lastUsedAt) : "—"}
                  </td>
                  <td className="p-3">
                    {!k.revokedAt && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === k.id}
                        onClick={() => handleRevoke(k)}
                      >
                        {busyId === k.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        إلغاء
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
