"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { Button, DriftStrip } from "@/components/cv";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

/**
 * Export the comparison on screen (canvas board "Detailed View", the
 * toolbar).
 *
 * Secondary, never primary: the screen's one Ink button is "Compare periods"
 * in the toolbar beside it. While a format is running the button shows the
 * scanning drift strip (Button's `loading`) instead of a spinner, which is the
 * design system's one loading device. Same three formats, same `onExport`
 * contract, same disabled rule.
 */

interface ExportButtonProps {
  hasData: boolean;
  onExport: (format: "pdf" | "xlsx" | "csv") => Promise<void>;
}

const FORMATS: { value: "pdf" | "xlsx" | "csv"; label: string; icon: React.ReactNode }[] = [
  { value: "pdf", label: "PDF", icon: <FileText className="mr-2 h-4 w-4" aria-hidden="true" /> },
  {
    value: "xlsx",
    label: "Excel",
    icon: <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />,
  },
  { value: "csv", label: "CSV", icon: <FileDown className="mr-2 h-4 w-4" aria-hidden="true" /> },
];

export function ExportButton({ hasData, onExport }: ExportButtonProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (format: "pdf" | "xlsx" | "csv") => {
    setExporting(format);
    try {
      await onExport(format);
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          iconLeft="download"
          disabled={!hasData}
          loading={exporting !== null}
        >
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Export as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATS.map((format) => (
          <DropdownMenuItem
            key={format.value}
            onClick={() => handleExport(format.value)}
            disabled={exporting !== null}
          >
            {exporting === format.value ? (
              <DriftStrip count={5} size="xs" animate="scan" className="mr-2" />
            ) : (
              format.icon
            )}
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
