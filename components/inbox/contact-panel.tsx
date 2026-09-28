"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ContactInfo } from "./types";

type Props = {
  contact: ContactInfo;
  onSave: (patch: Partial<Pick<ContactInfo, "name" | "tags" | "notes">>) => void;
};

// لوحة جهة الاتصال (العمود الأيسر): الاسم، الوسوم، الملاحظات، الحجوزات
export function ContactPanel({ contact, onSave }: Props) {
  const [name, setName] = useState(contact.name ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [tagInput, setTagInput] = useState("");

  // مزامنة الحقول عند تبديل جهة الاتصال
  useEffect(() => {
    setName(contact.name ?? "");
    setNotes(contact.notes ?? "");
    setTagInput("");
  }, [contact.id, contact.name, contact.notes]);

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || contact.tags.includes(tag)) return;
    onSave({ tags: [...contact.tags, tag] });
    setTagInput("");
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
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

      {/* الحجوزات — ميزة قادمة */}
      <div className="space-y-2">
        <Label>الحجوزات</Label>
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <CalendarDays className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">لا توجد حجوزات بعد</p>
        </div>
      </div>
    </div>
  );
}
