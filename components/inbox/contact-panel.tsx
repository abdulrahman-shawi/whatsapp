"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MessagesSquare, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_STAGES, stageConfig } from "@/lib/contact-stages";
import type { ContactInfo } from "./types";

type Props = {
  contact: ContactInfo;
  onSave: (
    patch: Partial<Pick<ContactInfo, "name" | "tags" | "notes" | "stage">>
  ) => void;
  // بطاقة المحادثة: وسوم وملاحظات على مستوى المحادثة (مستقلة عن جهة الاتصال)
  conversation?: { id: string; tags: string[]; notes: string | null } | null;
  onSaveConversation?: (patch: { tags?: string[]; notes?: string | null }) => void;
};

// لوحة جهة الاتصال (العمود الأيسر): بطاقة المحادثة، الاسم، الوسوم، الملاحظات، الحجوزات
export function ContactPanel({ contact, onSave, conversation, onSaveConversation }: Props) {
  const [name, setName] = useState(contact.name ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [tagInput, setTagInput] = useState("");
  const [convTagInput, setConvTagInput] = useState("");
  const [convNotes, setConvNotes] = useState(conversation?.notes ?? "");
  const [bookings, setBookings] = useState<
    { id: string; title: string; scheduledAt: string; notes: string | null }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bookings?contactId=${contact.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.bookings) setBookings(data.bookings);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  // مزامنة الحقول عند تبديل جهة الاتصال أو المحادثة
  useEffect(() => {
    setName(contact.name ?? "");
    setNotes(contact.notes ?? "");
    setTagInput("");
    setConvTagInput("");
    setConvNotes(conversation?.notes ?? "");
  }, [contact.id, contact.name, contact.notes, conversation?.id, conversation?.notes]);

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || contact.tags.includes(tag)) return;
    onSave({ tags: [...contact.tags, tag] });
    setTagInput("");
  }

  function addConvTag() {
    const tag = convTagInput.trim();
    if (!tag || !conversation || conversation.tags.includes(tag)) return;
    onSaveConversation?.({ tags: [...conversation.tags, tag] });
    setConvTagInput("");
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      {/* بطاقة المحادثة: وسوم وملاحظات تخص هذه المحادثة وحدها */}
      {conversation && onSaveConversation && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Label className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessagesSquare className="h-3.5 w-3.5" />
            بطاقة المحادثة
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {conversation.tags.length === 0 && (
              <span className="text-xs text-muted-foreground">بلا وسوم</span>
            )}
            {conversation.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1">
                {tag}
                <button
                  onClick={() =>
                    onSaveConversation({
                      tags: conversation.tags.filter((t) => t !== tag),
                    })
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              value={convTagInput}
              onChange={(e) => setConvTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addConvTag();
              }}
              placeholder="وسم للمحادثة…"
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={addConvTag}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <Textarea
            value={convNotes}
            onChange={(e) => setConvNotes(e.target.value)}
            placeholder="ملاحظة داخلية على هذه المحادثة…"
            rows={2}
            className="text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onSaveConversation({ notes: convNotes })}
            disabled={convNotes.trim() === (conversation.notes ?? "")}
          >
            حفظ ملاحظة المحادثة
          </Button>
        </div>
      )}

      {/* الاسم */}
      <div className="space-y-2">
        <Label htmlFor="contact-name">الاسم</Label>
        <Input
          id="contact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() !== (contact.name ?? "")) onSave({ name });
          }}
          placeholder="بدون اسم"
        />
        <p className="text-xs text-muted-foreground" dir="ltr">
          {contact.waPhone}
        </p>
      </div>

      {/* حالة العميل في مسار البيع */}
      <div className="space-y-2">
        <Label htmlFor="contact-stage">حالة العميل</Label>
        <div className="relative">
          <span
            className="pointer-events-none absolute start-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: stageConfig(contact.stage).color }}
          />
          <select
            id="contact-stage"
            value={contact.stage}
            onChange={(e) => onSave({ stage: e.target.value })}
            className="w-full appearance-none rounded-md border bg-background py-1.5 ps-8 pe-2 text-sm"
          >
            {CONTACT_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* الوسوم */}
      <div className="space-y-2">
        <Label>الوسوم</Label>
        <div className="flex flex-wrap gap-1.5">
          {contact.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                onClick={() =>
                  onSave({ tags: contact.tags.filter((t) => t !== tag) })
                }
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag();
            }}
            placeholder="وسم جديد…"
            className="h-8 text-xs"
          />
          <Button size="sm" variant="outline" onClick={addTag}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* الملاحظات */}
      <div className="space-y-2">
        <Label htmlFor="contact-notes">ملاحظات</Label>
        <Textarea
          id="contact-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ملاحظات عن هذا العميل…"
          rows={4}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSave({ notes })}
          disabled={notes.trim() === (contact.notes ?? "")}
        >
          حفظ الملاحظات
        </Button>
      </div>

      {/* الحجوزات */}
      <div className="space-y-2">
        <Label>الحجوزات</Label>
        {bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
            <CalendarDays className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">لا توجد حجوزات بعد</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{b.title}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(b.scheduledAt).toLocaleString("ar", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                {b.notes && (
                  <p className="mt-1 text-xs text-muted-foreground">{b.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
