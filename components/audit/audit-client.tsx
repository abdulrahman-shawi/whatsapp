"use client";

import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { relativeTime } from "@/lib/time";

export type AuditRow = {
  id: string;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  ASSIGN: "إسناد",
  CLOSE: "إغلاق",
  REOPEN: "إعادة فتح",
  DELETE: "حذف",
  UPDATE: "تعديل",
  CREATE: "إنشاء",
  SEND: "إرسال",
};

const ENTITY_LABELS: Record<string, string> = {
  conversation: "محادثة",
  workflow: "سير عمل",
  broadcast: "حملة",
  member: "عضو",
  setting: "إعدادات",
  form: "نموذج",
  agent: "وكيل",
  webhook: "ويب هوك",
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "warning" | "success" | "outline"> =
  {
    ASSIGN: "default",
    CLOSE: "secondary",
    REOPEN: "success",
    DELETE: "warning",
    UPDATE: "outline",
    CREATE: "success",
    SEND: "default",
  };

function truncateId(id: string | null): string {
  if (!id) return "";
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

// سجل التدقيق: فلترة بالإجراء/الكيان وبحث نصي، مع عرض نسبي للوقت
export function AuditClient({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (action && r.action !== action) return false;
      if (entity && r.entity !== entity) return false;
      if (
        needle &&
        !(r.userName ?? "").toLowerCase().includes(needle) &&
        !(r.entityId ?? "").toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, q, action, entity]);

  const hasFilters = Boolean(q.trim() || action || entity);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <History className="h-5 w-5" />
          سجل التدقيق ({filtered.length})
        </h1>
        {hasFilters && (
          <Button
            variant="outline"
            onClick={() => {
              setQ("");
              setAction("");
              setEntity("");
            }}
          >
            مسح الفلاتر
          </Button>
        )}
      </div>

      {/* الفلاتر */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث باسم المستخدم أو المعرف…"
            className="ps-8"
          />
        </div>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">كل الإجراءات</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">كل الكيانات</option>
          {Object.entries(ENTITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>آخر {rows.length} حدثاً</CardTitle>
          <CardDescription>
            يُسجَّل هنا إنشاء وتعديل وحذف العناصر الرئيسية في مساحة العمل
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا توجد أحداث مطابقة للفلاتر الحالية
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="py-2 pe-4 text-start font-medium">المستخدم</th>
                    <th className="py-2 pe-4 text-start font-medium">الإجراء</th>
                    <th className="py-2 pe-4 text-start font-medium">الكيان</th>
                    <th className="py-2 pe-4 text-start font-medium">تفاصيل</th>
                    <th className="py-2 text-start font-medium">الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pe-4 font-medium">
                        {r.userName ?? "النظام"}
                      </td>
                      <td className="py-2 pe-4">
                        <Badge variant={ACTION_VARIANTS[r.action] ?? "outline"}>
                          {ACTION_LABELS[r.action] ?? r.action}
                        </Badge>
                      </td>
                      <td className="py-2 pe-4">
                        {ENTITY_LABELS[r.entity] ?? r.entity}
                        {r.entityId && (
                          <span
                            dir="ltr"
                            className="ms-2 inline-block max-w-24 truncate align-middle text-xs text-muted-foreground"
                            title={r.entityId}
                          >
                            {truncateId(r.entityId)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pe-4">
                        {r.meta != null && (
                          <code
                            dir="ltr"
                            className="block max-w-72 truncate text-xs text-muted-foreground"
                            title={JSON.stringify(r.meta)}
                          >
                            {JSON.stringify(r.meta)}
                          </code>
                        )}
                      </td>
                      <td className="py-2 whitespace-nowrap text-muted-foreground">
                        {relativeTime(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
