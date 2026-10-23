"use client";

import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  rows: (string | number)[][];
};

export function ReportsExportButtons({ rows }: Props) {
  function exportExcel() {
    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "");
            const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
            return `"${safeText.replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={exportExcel}>
        <FileSpreadsheet className="size-4" />
        Excel (CSV)
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="size-4" />
        حفظ PDF
      </Button>
    </div>
  );
}
