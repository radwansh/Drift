"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { AnnualSummary } from "@saas/payroll-core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface AnnualExportProps {
  summary: AnnualSummary;
}

/**
 * Export (step 42).
 *
 * Excel is built server-side from the same summary the page renders, so the
 * workbook cannot drift from the screen. The board pack is the browser's own
 * print-to-PDF against a print stylesheet — a real PDF renderer would be a
 * second layout to keep in sync with this one, and the figures here are tables
 * and charts that print well.
 */
export function AnnualExport({ summary }: AnnualExportProps) {
  const [downloading, setDownloading] = useState(false);
  const utils = trpc.useUtils();

  async function downloadWorkbook() {
    setDownloading(true);
    try {
      const result = await utils.annual.exportWorkbook.fetch({
        year: summary.year,
        periodType: summary.periodType,
        currency: summary.currency,
        forecastMethod: summary.forecastMethod,
      });

      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={downloadWorkbook}>
          <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
          Excel workbook
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          Board pack (print or save as PDF)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
