import type { ReactNode } from "react";

// إطار يحاكي لقطة شاشة من لوحة تحكم خارجية (لا نستطيع تضمين صور حقيقية)
// الإطار LTR لأنه يحاكي واجهات إنجليزية، والتسميات العربية داخله RTL
export function MockScreenshot({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <figure
      dir="ltr"
      className="my-3 overflow-hidden rounded-lg border bg-muted/40 shadow-sm"
    >
      {/* شريط علوي يحاكي نافذة المتصفح بثلاث نقاط */}
      <div className="flex items-center gap-1.5 border-b bg-card px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="mx-auto truncate rounded bg-muted px-4 py-0.5 font-mono text-[10px] text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </figure>
  );
}

// عنصر مُظلَّل بحلقة بنفسجية — يمثّل الزر أو الحقل المطلوب الضغط عليه
export function Hl({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-block rounded ring-2 ring-primary ring-offset-2 ring-offset-background">
      {label && (
        <span
          dir="rtl"
          className="absolute -top-6 right-0 z-10 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
        >
          ⬅ {label}
        </span>
      )}
      {children}
    </span>
  );
}

// سطر رمادي يحاكي نصاً في الواجهة (wireframe)
export function Bar({ className = "" }: { className?: string }) {
  return (
    <div className={`h-2 rounded bg-muted-foreground/20 ${className}`} />
  );
}

// زر بنفسجي داخل الرسم التوضيحي
export function MockButton({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground">
      {children}
    </span>
  );
}

// حقل إدخال داخل الرسم التوضيحي — غلّفه بـ <Hl> لتظليله
export function MockField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-2 rounded border bg-background px-2 py-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[10px]">{value}</span>
    </span>
  );
}
