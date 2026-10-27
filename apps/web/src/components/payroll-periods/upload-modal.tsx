"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";
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
  RefreshCw,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodType } from "@saas/types";
import { suggestColumnRole, type SnapshotField } from "@saas/payroll-core";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";

interface ColumnMappingState {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
  /** Step 9: what the column records when it is not a pay component. */
  snapshotField: SnapshotField | null;
  dimensionName: string | null;
}

/**
 * Step 4: a control total the admin typed, or null when the box is empty.
 *
 * Empty is 'not supplied', which the check reports rather than treating as
 * agreement. A box with something unparseable in it is also null rather than
 * 0 — 0 would be a stated total that disagrees with every real register.
 */
/** A figure in the Data check panel, at the panel's own precision. */
function formatPanelMoney(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * One line of the Data check panel.
 *
 * `muted` is for a check that was not run rather than one that passed — an
 * unsupplied control total is neither a tick nor a cross, and showing it as a
 * tick is exactly the claim this panel must not make.
 */
function CheckLine({
  passed,
  label,
  detail,
  muted = false,
}: {
  passed: boolean;
  label: string;
  detail?: string;
  muted?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      {muted ? (
        <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : passed ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" aria-hidden />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
      )}
      <span className="flex-1 text-xs">{label}</span>
      {detail && (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{detail}</span>
      )}
      <span className="sr-only">{muted ? "not checked" : passed ? "passed" : "failed"}</span>
    </li>
  );
}

function parseControlTotal(text: string): number | null {
  const trimmed = text.trim().replace(/[,s]/g, "");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Step 9: a column recorded as a date, an FTE or a dimension is not pay. */
function hasRecordRole(m: ColumnMappingState): boolean {
  return m.snapshotField !== null || m.dimensionName !== null;
}

/**
 * Step 9: what to tell the admin about a column the reader refused.
 *
 * Each says what to change in the file, not what the code decided — "mixed
 * formats" is actionable and "ambiguous_date_order" is not.
 */
const COLUMN_ISSUE_MESSAGES: Record<string, string> = {
  ambiguous_date_order:
    "every date reads both ways, so none was imported. Use YYYY-MM-DD, or include one date past the 12th.",
  inconsistent_date_order:
    "the column mixes day-first and month-first dates, so none was imported. Use YYYY-MM-DD.",
  unreadable_values: "some values could not be read and were left out.",
  fte_looks_like_percent:
    "the values look like percentages, so none was imported. Use 0.5 for a half-timer, or add a % sign.",
  fte_out_of_range: "some values were not positive and were left out.",
};

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

/**
 * The sheet as objects keyed by trimmed header, which is the shape the server's
 * `validateRows`/`processUpload` expect and matches `mapping.sourceColumn`.
 */
function rowsFromData(data: string[][]): Record<string, unknown>[] {
  const headers = data[0];
  if (!headers) return [];
  return data.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      obj[header.trim()] = row[i] ?? "";
    });
    return obj;
  });
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
      !m.isNetSalary &&
      // Step 9: matches the server's filter, so the preview shows the same
      // components the import will write.
      !hasRecordRole(m),
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
  const utils = trpc.useUtils();
  const ingest = trpc.payrollPeriods.ingest.useMutation();
  const checkData = trpc.payrollPeriods.checkData.useMutation();
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    employeeCount: number;
    totalGross: number;
    totalNet: number;
    warnings: number;
    /** Step 9: columns that were mapped but could not be read. */
    columnIssues: { sourceColumn: string; target: string; problem: { code: string; samples: string[] } }[];
  } | null>(null);
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
  /**
   * Step 4: the real check, from `payrollPeriods.checkData`.
   *
   * This used to be four counts with `errors: 0, warnings: 0` as literals, so
   * the panel headed "Validation Summary" reported "All clear" on a register
   * that was 520.00 out.
   */
  const [validationResult, setValidationResult] = useState<
    RouterOutputs["payrollPeriods"]["checkData"] | null
  >(null);
  /** What the admin says the register's own export totalled. */
  const [controlGross, setControlGross] = useState("");
  const [controlNet, setControlNet] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [saved, setSaved] = useState(false);
  const [createComponentColumn, setCreateComponentColumn] = useState<string | null>(null);
  const [newComponentName, setNewComponentName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // Step 9: an identifier header wins, then a record role, then pay. The
      // admin confirms whatever this picks in the mapping step.
      const role = isIdent ? null : suggestColumnRole(trimmed);
      const snapshotField = role?.kind === "snapshotField" ? role.field : null;
      const dimensionName = role?.kind === "dimension" ? role.name : null;
      return {
        sourceColumn: trimmed,
        mappedComponent: isIdent || role !== null ? "" : trimmed,
        isEmployeeId: ident.isEmployeeId ?? false,
        isEmployeeName: ident.isEmployeeName ?? false,
        isDepartment: ident.isDepartment ?? false,
        isGrossSalary: ident.isGrossSalary ?? false,
        isNetSalary: ident.isNetSalary ?? false,
        snapshotField,
        dimensionName,
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
    setControlGross("");
    setControlNet("");
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

  /**
   * Step 3 of docs/ANNUAL_PAGE_FIX_PLAN.md.
   *
   * Both stages used to be `setTimeout` fakes — a 1s "Validating…" and a 2.5s
   * "Processing your payroll data…" — after which the data was pushed into a
   * React context and nothing was ever sent anywhere. "Upload complete!" was
   * shown unconditionally. The validation summary is now computed immediately
   * (it is a local calculation and had no reason to be delayed) and the import
   * calls `payrollPeriods.ingest`, which writes the period, the employee
   * snapshots and the per-period aggregates.
   */
  const handleNextStep = async () => {
    if (step === 2) {
      if (periodType === "monthly" && (!selectedMonth || !selectedYear)) return;
      if (periodType !== "monthly" && (!dateFrom || !dateTo)) return;
      setStep(3);
      return;
    }

    if (step === 3) {
      // Step 4: the real check, on the server. The browser has the rows, but
      // the gate is server-side and the panel has to show what the gate will
      // decide — anything computed here could disagree with it.
      setValidating(true);
      setImportError(null);
      try {
        const result = await checkData.mutateAsync({
          rows: fileData ? rowsFromData(fileData) : [],
          mappings,
          currencyCode: "USD",
          controlTotalGross: parseControlTotal(controlGross),
          controlTotalNet: parseControlTotal(controlNet),
        });
        setValidationResult(result);
        setStep(4);
      } catch (error) {
        setImportError(
          error instanceof Error ? error.message : "The data check could not be run.",
        );
      } finally {
        setValidating(false);
      }
      return;
    }

    if (step === 4) await runImport();
  };

  /**
   * The real import. Separate from `handleNextStep` because "Try again" on a
   * failure runs it while `step` is already 5.
   */
  const runImport = async () => {
    const effectiveFrom =
      periodType === "monthly" && selectedYear && selectedMonth
        ? `${selectedYear}-${selectedMonth}-01`
        : dateFrom;
    const effectiveTo =
      periodType === "monthly" && selectedYear && selectedMonth
        ? new Date(Date.UTC(parseInt(selectedYear), parseInt(selectedMonth), 0))
            .toISOString()
            .split("T")[0] ?? ""
        : dateTo;
    setImportError(null);
    setProcessing(true);
    setStep(5);

    try {
      const result = await ingest.mutateAsync({
        rows: fileData ? rowsFromData(fileData) : [],
        mappings,
        periodType,
        periodStart: effectiveFrom,
        periodEnd: effectiveTo,
        currencyCode: "USD",
        filename: fileName ?? "unknown",
        controlTotalGross: parseControlTotal(controlGross),
        controlTotalNet: parseControlTotal(controlNet),
      });

      setImportResult({
        employeeCount: result.employeeCount,
        totalGross: result.totalGross,
        totalNet: result.totalNet,
        warnings: result.warnings.length,
        columnIssues: result.columnIssues,
      });

      await utils.payrollPeriods.list.invalidate();
      setSaved(true);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "The import failed. Please try again.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const availableComponents = useMemo(() => {
    const comps = new Set<string>();
    mappings.forEach((m) => {
      if (m.isEmployeeId || m.isEmployeeName || m.isDepartment || m.isGrossSalary || m.isNetSalary) return;
      // Step 9: a hire date is not a component anyone should be able to pick.
      if (hasRecordRole(m)) return;
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
    setControlGross("");
    setControlNet("");
    setSaved(false);
    setImportError(null);
    setImportResult(null);
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
            {step === 4 && "Data Check"}
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

            {/*
              Step 4's control total, asked here because this is the last step
              before the check: the admin still has the export they uploaded in
              front of them. Optional, and the next panel says "not supplied"
              rather than ticking it, because Clarivo's own totals can only ever
              agree with themselves.
            */}
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs font-medium">
                Control totals from your payroll export{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                The figures printed on the report you exported. Clarivo ticks what it adds up from
                the rows against them, and refuses the import if they disagree.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="control-gross" className="text-[11px] text-muted-foreground">
                    Total gross
                  </label>
                  <input
                    id="control-gross"
                    type="text"
                    inputMode="decimal"
                    value={controlGross}
                    onChange={(e) => setControlGross(e.target.value)}
                    placeholder="Leave blank to skip"
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="control-net" className="text-[11px] text-muted-foreground">
                    Total net
                  </label>
                  <input
                    id="control-net"
                    type="text"
                    inputMode="decimal"
                    value={controlNet}
                    onChange={(e) => setControlNet(e.target.value)}
                    placeholder="Leave blank to skip"
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
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

                {/*
                  Step 4: the two identities that define a correct register.
                  Shown as a check each, with the figures, because "520.00 of
                  earnings is not in your Gross column" is actionable and
                  "1 error" is not.
                */}
                {validationResult.reconciliation && (
                  <div className="rounded-lg border bg-card">
                    <p className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Data check
                    </p>
                    <ul className="divide-y">
                      <CheckLine
                        passed={!validationResult.errors.some((e) => e.message.includes("Gross says"))}
                        label="Earnings add up to gross"
                        // Not a tick when nothing is mapped on that side: there
                        // is no statement to verify, and showing a tick would
                        // claim one.
                        muted={!validationResult.reconciliation.coverage.earnings}
                        detail={
                          validationResult.reconciliation.coverage.earnings
                            ? `${formatPanelMoney(validationResult.reconciliation.totals.earnings + validationResult.reconciliation.totals.unplaced)} against ${formatPanelMoney(validationResult.reconciliation.totals.gross)}`
                            : "No earnings columns mapped"
                        }
                      />
                      <CheckLine
                        passed={!validationResult.errors.some((e) => e.message.includes("Net says"))}
                        label="Gross minus deductions equals net"
                        muted={!validationResult.reconciliation.coverage.deductions}
                        detail={
                          validationResult.reconciliation.coverage.deductions
                            ? `${formatPanelMoney(validationResult.reconciliation.totals.gross - validationResult.reconciliation.totals.deductions)} against ${formatPanelMoney(validationResult.reconciliation.totals.net)}`
                            : "No deduction columns mapped"
                        }
                      />
                      <CheckLine
                        passed={!validationResult.errors.some((e) => e.message.includes("is above gross"))}
                        label="No net above its gross"
                      />
                      <CheckLine
                        passed={!validationResult.errors.some((e) => e.message.includes("net is"))}
                        label="No negative net"
                      />
                      <CheckLine
                        passed={!validationResult.errors.some((e) => e.message.includes("Duplicate employee ID"))}
                        label="No employee ID used twice"
                      />
                      <CheckLine
                        passed={validationResult.controlTotals.length === 0}
                        label="Control totals"
                        detail={
                          validationResult.controlTotalsMissing.length === 2
                            ? "Not supplied"
                            : validationResult.controlTotalsMissing.length === 1
                              ? `${validationResult.controlTotalsMissing[0]} not supplied`
                              : "Both lines agree"
                        }
                        muted={validationResult.controlTotalsMissing.length > 0}
                      />
                    </ul>
                  </div>
                )}

                {validationResult.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>
                      {validationResult.errors.length === 1
                        ? "1 problem stops this import"
                        : `${validationResult.errors.length} problems stop this import`}
                    </AlertTitle>
                    <AlertDescription>
                      <p className="mb-2">
                        Nothing is saved until the register is corrected and re-uploaded.
                      </p>
                      <ul className="space-y-1">
                        {validationResult.errors.slice(0, 8).map((e, i) => (
                          <li key={i} className="text-[11px] leading-snug">
                            {e.message}
                          </li>
                        ))}
                      </ul>
                      {validationResult.errors.length > 8 && (
                        <p className="mt-2 text-[11px] opacity-80">
                          and {validationResult.errors.length - 8} more.
                        </p>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {validationResult.warnings.length > 0 && (
                  <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>
                      {validationResult.warnings.length === 1
                        ? "1 thing worth a look"
                        : `${validationResult.warnings.length} things worth a look`}
                    </AlertTitle>
                    <AlertDescription>
                      <p className="mb-2">These do not stop the import.</p>
                      <ul className="space-y-1">
                        {validationResult.warnings.slice(0, 6).map((w, i) => (
                          <li key={i} className="text-[11px] leading-snug">
                            {w.message}
                          </li>
                        ))}
                      </ul>
                      {validationResult.warnings.length > 6 && (
                        <p className="mt-2 text-[11px] opacity-80">
                          and {validationResult.warnings.length - 6} more.
                        </p>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {validationResult.errors.length === 0 &&
                  validationResult.warnings.length === 0 && (
                    <Alert variant="info">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertTitle>The register reconciles</AlertTitle>
                      <AlertDescription>
                        Both totals tie out to the {validationResult.detectedCurrency ?? "currency"}&rsquo;s
                        smallest unit. Ready to import.
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
                <p className="mt-4 text-sm font-medium">Saving your payroll data...</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This may take a few moments
                </p>
                <div className="mt-6 h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
                </div>
              </>
            ) : importError ? (
              <div className="w-full">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Import failed</AlertTitle>
                  <AlertDescription>{importError}</AlertDescription>
                </Alert>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Nothing was saved. Go back to adjust the mapping, or try again.
                </p>
              </div>
            ) : (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="mt-4 text-sm font-medium">Upload complete</p>
                {importResult ? (
                  <p className="mt-1 text-center text-xs text-muted-foreground">
                    Saved {importResult.employeeCount} employee
                    {importResult.employeeCount === 1 ? "" : "s"} for this period.
                    {importResult.warnings > 0
                      ? ` ${importResult.warnings} warning${importResult.warnings === 1 ? "" : "s"} recorded.`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your payroll period has been saved.
                  </p>
                )}

                {/*
                  Step 9. A column the reader refused leaves its field empty,
                  and an empty field looks like a register that did not carry
                  the data. Saying which column and why is the difference
                  between "your file has no hire dates" and "fix the format".
                */}
                {importResult && importResult.columnIssues.length > 0 && (
                  <div className="mt-4 w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-900/50 dark:bg-amber-950/30">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      The pay imported. These columns did not.
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {importResult.columnIssues.map((issue, i) => (
                        <li key={`${issue.sourceColumn}-${i}`} className="text-[11px] text-amber-900/90 dark:text-amber-200/90">
                          <span className="font-medium">{issue.sourceColumn}</span>
                          {" — "}
                          {COLUMN_ISSUE_MESSAGES[issue.problem.code] ?? "could not be read."}
                          {issue.problem.samples.length > 0 && (
                            <span className="opacity-80"> e.g. {issue.problem.samples.join(", ")}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
            {(step < 5 || importError) && (
              <Button
                variant="outline"
                onClick={() => {
                  if (importError) {
                    setImportError(null);
                    setStep(4);
                    return;
                  }
                  handlePrevStep();
                }}
                disabled={step <= 1 || processing}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 5 && importError ? (
              <Button onClick={() => void runImport()} disabled={processing}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
            ) : step === 5 ? (
              <Button onClick={() => handleOpenChangeWrapper(false)} disabled={processing}>
                Done
              </Button>
            ) : (
              <Button
                onClick={() => void handleNextStep()}
                disabled={
                  (step === 2 && (
                    periodType === "monthly" ? (!selectedMonth || !selectedYear) : (!dateFrom || !dateTo)
                  )) ||
                  (step === 3 && !mappings.some((m) => m.isEmployeeId || m.isEmployeeName)) ||
                  (step === 4 && validationResult !== null && !validationResult.valid) ||
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
