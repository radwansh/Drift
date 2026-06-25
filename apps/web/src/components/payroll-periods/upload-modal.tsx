"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { usePayrollStore } from "@/lib/payroll-store";
import type { EmployeeRecord } from "@saas/payroll-core";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { MappingRow } from "./mapping-row";
import {
  Upload,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  X,
  Brain,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodType } from "@saas/types";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";

interface ColumnMappingState {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
}

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PERIOD_TYPE_OPTIONS = Object.entries(PERIOD_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const y = currentYear - 2 + i;
  return { value: String(y), label: String(y) };
});

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseEmployeesFromData(
  data: string[][],
  mappings: ColumnMappingState[],
): EmployeeRecord[] {
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = data.slice(1);

  const colIndex: Record<string, number> = {};
  mappings.forEach((m) => {
    const idx = headers.indexOf(m.sourceColumn);
    if (idx >= 0) colIndex[m.sourceColumn] = idx;
  });

  const employeeIdCol = mappings.find((m) => m.isEmployeeId)?.sourceColumn;
  const employeeNameCol = mappings.find((m) => m.isEmployeeName)?.sourceColumn;
  const departmentCol = mappings.find((m) => m.isDepartment)?.sourceColumn;
  const grossSalaryCol = mappings.find((m) => m.isGrossSalary)?.sourceColumn;
  const netSalaryCol = mappings.find((m) => m.isNetSalary)?.sourceColumn;
  const componentCols = mappings.filter(
    (m) =>
      m.mappedComponent &&
      m.mappedComponent !== "ignore" &&
      !m.isEmployeeId &&
      !m.isEmployeeName &&
      !m.isDepartment &&
      !m.isGrossSalary &&
      !m.isNetSalary,
  );

  let rowCounter = 0;
  return rows.map((row) => {
    const getVal = (col: string | undefined) => {
      if (!col) return undefined;
      const idx = colIndex[col];
      return idx !== undefined ? row[idx] : undefined;
    };

    const components: Record<string, number | null> = {};
    componentCols.forEach((m) => {
      const val = getVal(m.sourceColumn);
      components[m.mappedComponent] = val ? (parseFloat(val) || 0) : null;
    });

    const externalId = getVal(employeeIdCol) || `row-${++rowCounter}`;
    const name = getVal(employeeNameCol) || `Employee ${externalId}`;

    return {
      externalId,
      name,
      department: getVal(departmentCol) || null,
      components,
      grossSalary: parseFloat(getVal(grossSalaryCol) || "0") || 0,
      netSalary: parseFloat(getVal(netSalaryCol) || "0") || 0,
    };
  });
}

export function UploadModal({ open, onOpenChange }: UploadModalProps) {
  const { addPeriod } = usePayrollStore();
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<string[][] | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mappings, setMappings] = useState<ColumnMappingState[]>([]);
  const [validating, setValidating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    totalRows: number;
    employeeCount: number;
    totalGross: number;
    totalNet: number;
    errors: number;
    warnings: number;
  } | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [saved, setSaved] = useState(false);
  const [createComponentColumn, setCreateComponentColumn] = useState<string | null>(null);
  const [newComponentName, setNewComponentName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const simulateAiSuggestions = useCallback((headers: string[]) => {
    const identifierHeaders: Record<string, Partial<ColumnMappingState>> = {
      "Employee ID": { isEmployeeId: true },
      "Employee Name": { isEmployeeName: true },
      "Full Name": { isEmployeeName: true },
      "Department": { isDepartment: true },
      "Gross Salary": { isGrossSalary: true },
      "Net Salary": { isNetSalary: true },
    };

    const result = headers.map((header) => {
      const trimmed = header.trim();
      const ident = identifierHeaders[trimmed] ?? {};
      const isIdent = !!(ident.isEmployeeId || ident.isEmployeeName || ident.isDepartment || ident.isGrossSalary || ident.isNetSalary);
      return {
        sourceColumn: trimmed,
        mappedComponent: isIdent ? "" : trimmed,
        isEmployeeId: ident.isEmployeeId ?? false,
        isEmployeeName: ident.isEmployeeName ?? false,
        isDepartment: ident.isDepartment ?? false,
        isGrossSalary: ident.isGrossSalary ?? false,
        isNetSalary: ident.isNetSalary ?? false,
      };
    });

    return result;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["csv", "xlsx", "xls"].includes(ext)) return;

      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (e) => {
        let data: string[][] = [];

        if (ext === "csv") {
          const text = e.target?.result as string;
          const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
          const lines = rawLines.filter((l) => l.trim());
          data = lines.map((l) => parseCsvLine(l));
        } else {
          const arrayBuf = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(arrayBuf, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          if (sheetName) {
            const sheet = workbook.Sheets[sheetName];
            const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
            data = raw
              .filter((row) => row.some((cell) => cell !== ""))
              .map((row) => row.map((cell) => String(cell ?? "").trim()));
          }
        }

        if (data.length > 0) {
          const headers = data[0];
          setFileData(data);
          setMappings(simulateAiSuggestions(headers));
          setValidationResult(null);
          setStep(2);
        }
      };

      if (ext === "csv") {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    },
    [simulateAiSuggestions],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(true);
  };

  const handleDragLeave = () => setDropActive(false);

  const handleNextStep = () => {
    if (step === 2) {
      if (periodType === "monthly" && (!selectedMonth || !selectedYear)) return;
      if (periodType !== "monthly" && (!dateFrom || !dateTo)) return;
      setStep(3);
    } else if (step === 3) {
      setValidating(true);
      timeoutRef.current = setTimeout(() => {
        const tempEmployees = fileData
          ? parseEmployeesFromData(fileData, mappings)
          : [];
        const totalRowCount = fileData ? fileData.length - 1 : 0;
        const totalGross = tempEmployees.reduce((s, e) => s + e.grossSalary, 0);
        const totalNet = tempEmployees.reduce((s, e) => s + e.netSalary, 0);
        setValidationResult({
          totalRows: totalRowCount,
          employeeCount: tempEmployees.length,
          totalGross,
          totalNet,
          errors: 0,
          warnings: 0,
        });
        setValidating(false);
        setStep(4);
      }, 1000);
    } else if (step === 4) {
      setProcessing(true);
      timeoutRef.current = setTimeout(() => {
        const effectiveFrom = periodType === "monthly" && selectedYear && selectedMonth
          ? `${selectedYear}-${selectedMonth}-01`
          : dateFrom;
        const effectiveTo = periodType === "monthly" && selectedYear && selectedMonth
          ? new Date(
              parseInt(selectedYear),
              parseInt(selectedMonth),
              0,
            )
              .toISOString()
              .split("T")[0] ?? ""
          : dateTo;
        const employees = fileData
          ? parseEmployeesFromData(fileData, mappings)
          : [];
        const label =
          periodType === "monthly" && selectedYear && selectedMonth
            ? new Date(
                parseInt(selectedYear),
                parseInt(selectedMonth) - 1,
              ).toLocaleString("en-US", { month: "long", year: "numeric" })
            : `${dateFrom} – ${dateTo}`;
        addPeriod({
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label,
          periodType,
          dateFrom: effectiveFrom,
          dateTo: effectiveTo,
          employees,
          fileName: fileName ?? "unknown",
        });
        setSaved(true);
        setProcessing(false);
        setStep(5);
      }, 2500);
    }
  };

  const availableComponents = useMemo(() => {
    const comps = new Set<string>();
    mappings.forEach((m) => {
      if (m.isEmployeeId || m.isEmployeeName || m.isDepartment || m.isGrossSalary || m.isNetSalary) return;
      comps.add(m.sourceColumn);
      if (m.mappedComponent && m.mappedComponent !== "ignore" && m.mappedComponent !== "__create__") {
        comps.add(m.mappedComponent);
      }
    });
    return Array.from(comps);
  }, [mappings]);

  const handleCreateComponent = (sourceColumn: string) => {
    setCreateComponentColumn(sourceColumn);
    setNewComponentName("");
  };

  const handleConfirmCreateComponent = () => {
    if (createComponentColumn && newComponentName.trim()) {
      setMappings((prev) =>
        prev.map((m) =>
          m.sourceColumn === createComponentColumn
            ? { ...m, mappedComponent: newComponentName.trim() }
            : m,
        ),
      );
      setCreateComponentColumn(null);
      setNewComponentName("");
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handlePrevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const reset = () => {
    setStep(1);
    setFileName(null);
    setFileData(null);
    setPeriodType("monthly");
    setSelectedMonth("");
    setSelectedYear("");
    setDateFrom("");
    setDateTo("");
    setMappings([]);
    setValidating(false);
    setProcessing(false);
    setValidationResult(null);
    setSaved(false);
  };

  const handleOpenChangeWrapper = (open: boolean) => {
    if (!open && step > 1 && !saved) {
      if (!window.confirm("Close upload? Your progress will be lost.")) return;
    }
    if (!open) reset();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChangeWrapper}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="h-4 w-4 mr-2" />
          Upload New Period
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn("transition-all", step >= 3 ? "sm:max-w-4xl" : "sm:max-w-[700px]")}
        onInteractOutside={(e) => {
          if (step > 1 && !saved) {
            if (!window.confirm("Close upload? Your progress will be lost.")) {
              e.preventDefault();
            }
          }
        }}
        onEscapeKeyDown={(e) => {
          if (step > 1 && !saved) {
            if (!window.confirm("Close upload? Your progress will be lost.")) {
              e.preventDefault();
            }
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Upload Payroll File"}
            {step === 2 && "Period Details"}
            {step === 3 && "Column Mapping"}
            {step === 4 && "Validation Summary"}
            {step === 5 && "Processing"}
          </DialogTitle>
          <DialogDescription>
            Step {step} of 5
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors",
              dropActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {fileName ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-12 w-12 text-primary" />
                <p className="text-sm font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">Click to change file</p>
              </div>
            ) : (
              <>
                <UploadCloud className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-1 text-sm font-medium">
                  Drag & drop your payroll file here
                </p>
                <p className="mb-4 text-xs text-muted-foreground">
                  or click to browse (CSV, XLSX, XLS)
                </p>
                <Badge variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" />
                  Supported formats
                </Badge>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span className="font-medium">{fileName}</span>
                <button
                  onClick={() => { setStep(1); setFileName(null); setFileData(null); }}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Period Type</label>
              <Select
                value={periodType}
                onValueChange={(val) => setPeriodType(val as PeriodType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {periodType === "monthly" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Month</label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select month..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Year</label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select year..." />
                    </SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map((y) => (
                        <SelectItem key={y.value} value={y.value}>
                          {y.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start Date</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">End Date</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Brain className="h-4 w-4 text-primary" />
                AI Suggested Mappings
              </span>
              <span className="text-xs text-muted-foreground">
                Review and adjust as needed
              </span>
            </div>
            <p className="text-xs text-muted-foreground px-1">
              Each column from your file is listed below. Use the dropdown to map it to a payroll
              salary component, or check an identifier field (Employee ID etc.) for employee
              matching. Columns marked as a salary component <em>and</em> an identifier field will
              be treated as an identifier only.
            </p>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {mappings.map((mapping, idx) => (
                <MappingRow
                  key={mapping.sourceColumn}
                  {...mapping}
                  availableComponents={availableComponents}
                  aiConfidence={0.75 + (idx % 3) * 0.08}
                  onChange={(updated) =>
                    setMappings((prev) =>
                      prev.map((m) =>
                        m.sourceColumn === updated.sourceColumn ? updated : m,
                      ),
                    )
                  }
                />
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            {validationResult && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums">{validationResult.totalRows}</p>
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums">{validationResult.employeeCount}</p>
                    <p className="text-xs text-muted-foreground">Employees</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">
                      ${(validationResult.totalGross / 1000).toFixed(0)}K
                    </p>
                    <p className="text-xs text-muted-foreground">Total Gross</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">
                      ${(validationResult.totalNet / 1000).toFixed(0)}K
                    </p>
                    <p className="text-xs text-muted-foreground">Total Net</p>
                  </div>
                </div>

                {validationResult.errors > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{validationResult.errors} Error(s)</AlertTitle>
                    <AlertDescription>
                      Some rows have validation errors and will be skipped.
                    </AlertDescription>
                  </Alert>
                )}

                {validationResult.warnings > 0 && (
                  <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{validationResult.warnings} Warning(s)</AlertTitle>
                    <AlertDescription>
                      Review flagged items before confirming.
                    </AlertDescription>
                  </Alert>
                )}

                {validationResult.errors === 0 && validationResult.warnings === 0 && (
                  <Alert variant="info">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>All clear</AlertTitle>
                    <AlertDescription>
                      No validation issues found. Ready to import.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col items-center justify-center py-8">
            {processing ? (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="mt-4 text-sm font-medium">Processing your payroll data...</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This may take a few moments
                </p>
                <div className="mt-6 h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="mt-4 text-sm font-medium">Upload complete!</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your payroll period has been processed successfully.
                </p>
              </>
            )}
          </div>
        )}

        {createComponentColumn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateComponentColumn(null)}>
            <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-1 text-sm font-medium">Create salary component</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Enter a name for the new salary component mapped from &ldquo;{createComponentColumn}&rdquo;
              </p>
              <input
                type="text"
                value={newComponentName}
                onChange={(e) => setNewComponentName(e.target.value)}
                placeholder="Component name..."
                className="mb-4 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmCreateComponent(); }}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setCreateComponentColumn(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleConfirmCreateComponent} disabled={!newComponentName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          </div>
        )}

        <Separator />

        <DialogFooter className="flex items-center justify-between">
          <div>
            {step < 5 && (
              <Button variant="outline" onClick={handlePrevStep} disabled={step <= 1}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 5 ? (
              <Button onClick={() => handleOpenChangeWrapper(false)}>
                Done
              </Button>
            ) : (
              <Button
                onClick={handleNextStep}
                disabled={
                  (step === 2 && (
                    periodType === "monthly" ? (!selectedMonth || !selectedYear) : (!dateFrom || !dateTo)
                  )) ||
                  (step === 3 && !mappings.some((m) => m.isEmployeeId || m.isEmployeeName)) ||
                  validating ||
                  processing
                }
              >
                {validating || processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {validating ? "Validating..." : "Processing..."}
                  </>
                ) : step === 4 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirm Import
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
