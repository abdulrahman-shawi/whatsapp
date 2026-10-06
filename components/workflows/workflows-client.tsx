"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// مسميات المحفّزات المعروضة
export const triggerLabels: Record<string, string> = {
  KEYWORD: "رسالة بكلمة مفتاحية",
  FROM_NUMBERS: "رسالة من أرقام محددة",
  NEW_CONTACT: "عميل جديد",
  STAGE_CHANGE: "تغيير حالة العميل",
  NO_REPLY: "لا رد من العميل",
};

type WorkflowRow = {
  id: string;
  name: string;
  trigger: string;
  triggerConfig: unknown;
  steps: unknown;
  isActive: boolean;
  createdAt: Date | string;
  createdBy: { name: string } | null;
  _count: { runs: number };
};

type Props = { workflows: WorkflowRow[] };

// صف وصف المحفّز باختصار: الكلمات أو الأرقام أو الحالات
function triggerSummary(w: WorkflowRow): string {
  const tc = (w.triggerConfig ?? {}) as Record<string, unknown>;
  if (w.trigger === "KEYWORD" && Array.isArray(tc.keywords)) {
    return (tc.keywords as string[]).join("، ");
  }
  if (w.trigger === "FROM_NUMBERS" && Array.isArray(tc.phones)) {
    return `${(tc.phones as string[]).length} رقم`;
  }
  if (w.trigger === "STAGE_CHANGE") {
    return `إلى: ${String(tc.toStage ?? "")}`;
  }
  if (w.trigger === "NO_REPLY") {
    return `بعد ${tc.hours ?? 24} ساعة صمت`;
  }
  return "";
}

// قائمة سير العمل — تشغيل/إيقاف فوري وحذف
export function WorkflowsClient({ workflows }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(w: WorkflowRow) {
    setBusyId(w.id);
    await fetch(`/api/workflows/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !w.isActive }),
    });
    setBusyId(null);
    router.refresh();
  }

  async function remove(w: WorkflowRow) {
    if (!confirm(`حذف سير العمل "${w.name}"؟ لا يمكن التراجع.`)) return;
    setBusyId(w.id);
    await fetch(`/api/workflows/${w.id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">سير العمل</h1>
          <p className="text-sm text-muted-foreground">
            أتمتة تلقائية: محفّز يشغّل خطوات متسلسلة دون تدخل بشري
          </p>
        </div>
        <Button asChild>
          <Link href="/workflows/new">
            <Plus className="h-4 w-4" />
            إنشاء سير عمل
          </Link>
        </Button>
      </div>

      {workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <WorkflowIcon className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              لا توجد سير عمل بعد — أنشئ أول أتمتة لردّ الترحيب أو المتابعة أو
              الإسناد التلقائي
            </p>
            <Button asChild variant="outline">
              <Link href="/workflows/new">إنشاء سير عمل</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الأتمتات ({workflows.length})</CardTitle>
            <CardDescription>
              عرض {workflows.length} من {workflows.length}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-start font-medium">الاسم</th>
                  <th className="pb-2 text-start font-medium">المحفّز</th>
                  <th className="pb-2 text-start font-medium">الشرط</th>
                  <th className="pb-2 text-start font-medium">الخطوات</th>
                  <th className="pb-2 text-start font-medium">تاريخ الإنشاء</th>
                  <th className="pb-2 text-start font-medium">أنشئه</th>
                  <th className="pb-2 text-start font-medium">الحالة</th>
                  <th className="pb-2 text-start font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((w) => (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{w.name}</td>
                    <td className="py-3">
                      <Badge variant="secondary">{triggerLabels[w.trigger]}</Badge>
                    </td>
                    <td className="max-w-40 truncate py-3 text-muted-foreground">
                      {triggerSummary(w)}
                    </td>
                    <td className="py-3">
                      {Array.isArray(w.steps) ? w.steps.length : 0} خطوة
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {new Date(w.createdAt).toLocaleString("ar", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {w.createdBy?.name ?? "—"}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => toggleActive(w)}
                        disabled={busyId === w.id}
                        className={`relative h-5 w-10 rounded-full transition-colors disabled:opacity-50 ${
                          w.isActive ? "bg-green-500" : "bg-muted"
                        }`}
                        title={w.isActive ? "إيقاف مؤقت" : "تشغيل"}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                            w.isActive ? "start-5" : "start-0.5"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="تعديل"
                        >
                          <Link href={`/workflows/${w.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="حذف"
                          disabled={busyId === w.id}
                          onClick={() => remove(w)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
