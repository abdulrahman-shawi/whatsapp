"use client";

import { useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CopyCommand } from "./copy-command";

type MemberItem = {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "STAFF";
};

type InviteItem = {
  id: string;
  token: string;
  role: "OWNER" | "STAFF";
};

// إدارة فريق العمل: دعوات لمرة واحدة، تغيير الأدوار، إزالة الأعضاء
// التعديلات للمالك فقط (myRole === "OWNER") ولا على حسابه الشخصي
export function MembersForm({
  initialMembers,
  initialInvites,
  currentUserId,
  myRole,
}: {
  initialMembers: MemberItem[];
  initialInvites: InviteItem[];
  currentUserId: string;
  myRole: "OWNER" | "STAFF";
}) {
  const [members, setMembers] = useState<MemberItem[]>(initialMembers);
  const [invites, setInvites] = useState<InviteItem[]>(initialInvites);
  const [inviteRole, setInviteRole] = useState<"STAFF" | "OWNER">("STAFF");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  // آخر رابط دعوة وُلّد — يبقى ظاهراً للنسخ حتى تُلغى الدعوة
  const [freshInvite, setFreshInvite] = useState<{
    id: string;
    url: string;
  } | null>(null);

  const isOwner = myRole === "OWNER";

  async function handleCreateInvite() {
    setCreating(true);
    setError("");
    const res = await fetch("/api/members/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: inviteRole }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "حدث خطأ أثناء إنشاء الدعوة");
      return;
    }
    const data = await res.json();
    setInvites((prev) => [data.invite, ...prev]);
    setFreshInvite({ id: data.invite.id, url: data.url });
  }

  async function handleRevoke(inviteId: string) {
    const res = await fetch(`/api/members/invites/${inviteId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      setFreshInvite((prev) => (prev?.id === inviteId ? null : prev));
    }
  }

  async function handleChangeRole(userId: string, role: "OWNER" | "STAFF") {
    const res = await fetch(`/api/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role } : m))
      );
    }
  }

  async function handleRemove(userId: string) {
    const res = await fetch(`/api/members/${userId}`, { method: "DELETE" });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    }
  }

  return (
    <div className="space-y-4">
      {/* إنشاء دعوة جديدة — للمالك فقط */}
      {isOwner && (
        <div className="rounded-lg border p-4">
          <Label htmlFor="invite-role">دعوة عضو جديد</Label>
          <div className="mt-1.5 flex gap-2">
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "STAFF" | "OWNER")}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="STAFF">موظف</option>
              <option value="OWNER">مالك</option>
            </select>
            <Button onClick={handleCreateInvite} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              <UserPlus className="h-4 w-4" />
              إنشاء رابط الدعوة
            </Button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {freshInvite && (
            <div className="mt-3">
              <p className="mb-1 text-sm text-muted-foreground">
                أرسل هذا الرابط للموظف — يعمل لمرة واحدة:
              </p>
              <CopyCommand command={freshInvite.url} />
            </div>
          )}
        </div>
      )}

      {/* الدعوات المعلّقة */}
      {invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">دعوات معلّقة</p>
          {invites.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <Badge variant="outline">
                  {i.role === "OWNER" ? "مالك" : "موظف"}
                </Badge>
                <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">
                  …/register?invite={i.token}
                </p>
              </div>
              {isOwner && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  title="إلغاء الدعوة"
                  onClick={() => handleRevoke(i.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* قائمة الأعضاء */}
      <div className="space-y-2">
        <p className="text-sm font-medium">الأعضاء ({members.length})</p>
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          const canEdit = isOwner && !isSelf && m.role !== "OWNER";
          return (
            <div
              key={m.userId}
              className="flex items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {m.name}
                  {isSelf && (
                    <span className="text-xs text-muted-foreground"> (أنا)</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {m.email}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEdit ? (
                  <select
                    value={m.role}
                    onChange={(e) =>
                      handleChangeRole(m.userId, e.target.value as "OWNER" | "STAFF")
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="STAFF">موظف</option>
                    <option value="OWNER">مالك</option>
                  </select>
                ) : (
                  <Badge variant={m.role === "OWNER" ? "default" : "secondary"}>
                    {m.role === "OWNER" ? "مالك" : "موظف"}
                  </Badge>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    title="إزالة العضو"
                    onClick={() => handleRemove(m.userId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
