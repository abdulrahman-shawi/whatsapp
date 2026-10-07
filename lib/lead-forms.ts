import { isContactStage, type ContactStageValue } from "@/lib/contact-stages";

// حقل واحد في نموذج استقبال العملاء — تُخزن الحقول مصفوفة في عمود Json
export type LeadFormField = {
  label: string;
  type: "text" | "phone" | "textarea";
  required: boolean;
};

const FIELD_TYPES = ["text", "phone", "textarea"];

// التحقق من مصفوفة الحقول: عنوان ١-٦٠ حرفاً، نوع معروف، وحقل جوال مطلوب واحد على الأقل
// تعيد الحقول المُنقّاة أو نص الخطأ
export function parseLeadFormFields(raw: unknown): LeadFormField[] | string {
  if (!Array.isArray(raw) || raw.length === 0) {
    return "أضف حقلاً واحداً على الأقل";
  }
  const fields: LeadFormField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return "حقول النموذج غير صالحة";
    const f = item as Record<string, unknown>;
    const label = typeof f.label === "string" ? f.label.trim() : "";
    if (!label || label.length > 60) {
      return "عنوان كل حقل بين ١ و٦٠ حرفاً";
    }
    if (typeof f.type !== "string" || !FIELD_TYPES.includes(f.type)) {
      return `نوع الحقل "${label}" غير صالح`;
    }
    fields.push({
      label,
      type: f.type as LeadFormField["type"],
      required: f.required === true,
    });
  }
  if (!fields.some((f) => f.type === "phone" && f.required)) {
    return "النموذج يحتاج حقل جوال واحداً على الأقل (مطلوب)";
  }
  return fields;
}

export type LeadFormData = {
  name?: string;
  title?: string;
  description?: string | null;
  fields?: LeadFormField[];
  autoTag?: string;
  autoStage?: ContactStageValue | null;
  isActive?: boolean;
};

// التحقق من مدخلات إنشاء/تحديث نموذج — partial=true للتحديث (كل حقل اختياري)
// تعيد كائن البيانات أو نص الخطأ
export function parseLeadFormBody(body: unknown, partial: boolean): LeadFormData | string {
  if (!body || typeof body !== "object") return "طلب غير صالح";
  const b = body as Record<string, unknown>;
  const data: LeadFormData = {};

  if (b.name !== undefined || !partial) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name || name.length > 60) {
      return partial ? "الاسم بين ١ و٦٠ حرفاً" : "اسم النموذج مطلوب (١-٦٠ حرفاً)";
    }
    data.name = name;
  }

  if (b.title !== undefined) {
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (title.length > 80) return "العنوان حتى ٨٠ حرفاً";
    data.title = title || "تواصل معنا";
  }

  if (b.description !== undefined) {
    if (b.description !== null && typeof b.description !== "string") {
      return "الوصف غير صالح";
    }
    data.description = b.description?.trim() || null;
  }

  if (b.fields !== undefined) {
    const fields = parseLeadFormFields(b.fields);
    if (typeof fields === "string") return fields;
    data.fields = fields;
  } else if (!partial) {
    return "حقول النموذج مطلوبة";
  }

  if (b.autoTag !== undefined) {
    if (typeof b.autoTag !== "string") return "الوسم التلقائي غير صالح";
    const autoTag = b.autoTag.trim();
    if (autoTag.length > 40) return "الوسم التلقائي حتى ٤٠ حرفاً";
    data.autoTag = autoTag;
  }

  if (b.autoStage !== undefined) {
    if (b.autoStage !== null && !isContactStage(b.autoStage)) {
      return "المرحلة الافتراضية غير صالحة";
    }
    data.autoStage = b.autoStage;
  }

  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") return "حالة التفعيل غير صالحة";
    data.isActive = b.isActive;
  }

  if (partial && Object.keys(data).length === 0) {
    return "لا يوجد ما يُحدَّث";
  }
  return data;
}
