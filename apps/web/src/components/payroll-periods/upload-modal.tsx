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
import { Button, DriftStrip, Icon, Notice, TextField, type IconName } from "@/components/cv";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MappingRow } from "./mapping-row";
import { ArrowLeft, FileSpreadsheet, RefreshCw } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { PeriodType } from "@saas/types";
import {
  ambiguityFor,
  suggestColumnRole,
  type Category,
  type SnapshotField,
} from "@saas/payroll-core";
import { PERIOD_TYPE_HINTS, PERIOD_TYPE_LABELS } from "@/lib/constants";

/**
 * The upload wizard, on Ink & Signal (canvas boards "Upload payroll file",
 * steps 1 to 5).
 *
 * **Nothing about the upload path moved.** Every step's validation, `useUpload`
 * — here, the `checkData` and `ingest` mutations — the suggestion pass and the
 * reconciliation gate are the code that was here before, line for line. The
 * gate is server-side (`validateRows` treats a repeated employee id as an
 * error and `payrollPeriods.ingest` throws before `processUpload` runs), and
 * step 4 exists to show what that gate will decide: its blocking panel still
 * says, in those words, that nothing is saved until the register is corrected
 * and re-uploaded. That sentence is the only part that matters to somebody
 * holding a spreadsheet, so it is the one sentence a restyle must not
 * paraphrase.
 *
 * What changed is the frame: one 600px dialog at every step (it used to jump to
 * 896px at step 3), a header with five progress ticks, and a footer that says
 * why Next is disabled instead of leaving the admin to find the disabled
 * button. The `Validation Summary` tiles that printed `$12K` are a definition
 * list through `formatCurrency`, so the figures read `USD 12,480.00` like every
 * other amount in the product — a dollar sign on a EUR register was a
 * mislabelled figure, not a shorthand.
 */

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
  /** Step 11b: the category chosen for a column the classifier cannot place. */
  resolvedCategory: Category | null;
}

const STEP_COUNT = 5;

const STEP_TITLES: Record<number, string> = {
  1: "Choose a file",
  2: "Period details",
  3: "Column mapping",
  4: "Data check",
  5: "Processing",
};

/**
 * One line of the Data check panel.
 *
 * `muted` is for a check that was not run rather than one that passed — an
 * unsupplied control total is neither a tick nor a cross, and showing it as a
 * tick is exactly the claim this panel must not make. The word beside the icon
 * is not decoration: a status colour never stands on its own in this system,
 * and "passed" is the part a screen reader and a printed board both need.
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
  const state: { icon: IconName; tone: string; word: string } = muted
    ? { icon: "info", tone: "text-cv-ink-subtle", word: "Not checked" }
    : passed
      ? { icon: "check-circle", tone: "text-cv-success-ink", word: "Passed" }
      : { icon: "x-circle", tone: "text-cv-danger-ink", word: "Failed" };

  return (
    <li className="flex items-start gap-2 px-3 py-2">
      <Icon name={state.icon} size={16} className={cn("mt-0.5 shrink-0", state.tone)} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-[18px] text-cv-ink">{label}</span>
        {detail && (
          <span className="mt-0.5 block font-cv-mono text-xs leading-4 text-cv-ink-subtle">
            {detail}
          </span>
        )}
      </span>
      <span className={cn("shrink-0 text-[13px] font-medium leading-[18px]", state.tone)}>
        {state.word}
      </span>
    </li>
  );
}

/**
 * Step 4: a control total the admin typed, or null when the box is empty.
 *
 * Empty is 'not supplied', which the check reports rather than treating as
 * agreement. A box with something unparseable in it is also null rather than
 * 0 — 0 would be a stated total that disagrees with every real register.
 */
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

const PERIOD_TYPE_OPTIONS = Object.entries(PERIOD_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

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
      components[m.mappedComponent] = val ? parseFloat(val) || 0 : null;
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
  // Step 11b: so a column answered on a previous upload is not asked again.
  const answeredQuery = trpc.payrollPeriods.answeredComponents.useQuery(undefined, {
    enabled: open,
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    employeeCount: number;
    totalGross: number;
    totalNet: number;
    warnings: number;
    /** Step 9: columns that were mapped but could not be read. */
    columnIssues: {
      sourceColumn: string;
      target: string;
      problem: { code: string; samples: string[] };
    }[];
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
      Department: { isDepartment: true },
      "Gross Salary": { isGrossSalary: true },
      "Net Salary": { isNetSalary: true },
    };

    const result = headers.map((header) => {
      const trimmed = header.trim();
      const ident = identifierHeaders[trimmed] ?? {};
      const isIdent = !!(
        ident.isEmployeeId ||
        ident.isEmployeeName ||
        ident.isDepartment ||
        ident.isGrossSalary ||
        ident.isNetSalary
      );
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
        resolvedCategory: null,
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
            const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
              header: 1,
              defval: "",
            }) as unknown[][];
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
        setImportError(error instanceof Error ? error.message : "The data check could not be run.");
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
        ? (new Date(Date.UTC(parseInt(selectedYear), parseInt(selectedMonth), 0))
            .toISOString()
            .split("T")[0] ?? "")
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
      if (m.isEmployeeId || m.isEmployeeName || m.isDepartment || m.isGrossSalary || m.isNetSalary)
        return;
      // Step 9: a hire date is not a component anyone should be able to pick.
      if (hasRecordRole(m)) return;
      comps.add(m.sourceColumn);
      if (
        m.mappedComponent &&
        m.mappedComponent !== "ignore" &&
        m.mappedComponent !== "__create__"
      ) {
        comps.add(m.mappedComponent);
      }
    });
    return Array.from(comps);
  }, [mappings]);

  /**
   * Step 11b: columns whose question nobody has answered yet.
   *
   * Computed from the same `ambiguityFor` the server uses, suppressed by the
   * same saved answers, so Next is disabled for exactly the columns the gate
   * would refuse — the admin is not sent to a Data check that tells them to
   * come back here.
   */
  const unansweredQuestions = useMemo(() => {
    const answered = answeredQuery.data ?? {};
    return mappings.filter((m) => {
      if (hasRecordRole(m)) return false;
      if (
        m.isEmployeeId ||
        m.isEmployeeName ||
        m.isDepartment ||
        m.isGrossSalary ||
        m.isNetSalary
      ) {
        return false;
      }
      if (!m.mappedComponent || m.mappedComponent === "ignore") return false;
      if (m.resolvedCategory !== null) return false;
      if (answered[m.mappedComponent] !== undefined) return false;
      return ambiguityFor(m.mappedComponent) !== undefined;
    });
  }, [mappings, answeredQuery.data]);

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

  /**
   * Why Next is off, named rather than left to be discovered.
   *
   * These four predicates are the ones the button's `disabled` already used,
   * pulled out under names so the footer hint and the button cannot drift
   * apart: one is the reason, the same expression is the disablement.
   */
  const needsPeriodDates =
    step === 2 &&
    (periodType === "monthly" ? !selectedMonth || !selectedYear : !dateFrom || !dateTo);
  const needsIdentifier = step === 3 && !mappings.some((m) => m.isEmployeeId || m.isEmployeeName);
  const needsAnswers = step === 3 && unansweredQuestions.length > 0;
  const blockedByChecks = step === 4 && validationResult !== null && !validationResult.valid;

  const nextDisabled =
    needsPeriodDates ||
    needsIdentifier ||
    needsAnswers ||
    blockedByChecks ||
    validating ||
    processing;

  const footerHint = (() => {
    if (step === 1) return "CSV, XLSX or XLS.";
    if (needsPeriodDates) {
      return periodType === "monthly"
        ? "Choose a month and a year."
        : "Choose a start and an end date.";
    }
    if (needsIdentifier) return "Tick Employee ID or Employee name on at least one column.";
    if (needsAnswers) {
      return unansweredQuestions.length === 1
        ? "1 column still needs a category."
        : `${unansweredQuestions.length} columns still need a category.`;
    }
    if (blockedByChecks) return "Nothing is saved until the register is corrected and re-uploaded.";
    if (step === 3) return "Nothing is saved yet. The next step checks the register.";
    if (step === 4) return "Confirming writes this period to your company.";
    if (step === 5 && importError) return "Nothing was saved.";
    return "";
  })();

  /** The currency the check read off the register, for every figure in step 4. */
  const checkCurrency = validationResult?.detectedCurrency ?? "USD";

  return (
    <Dialog open={open} onOpenChange={handleOpenChangeWrapper}>
      <DialogTrigger asChild>
        <Button iconLeft="upload">Upload period</Button>
      </DialogTrigger>
      <DialogContent
        className="gap-4 sm:max-w-[600px]"
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
          <DialogTitle>Upload payroll file</DialogTitle>
          <DialogDescription>
            Step {step} of {STEP_COUNT} · {STEP_TITLES[step]}
          </DialogDescription>
          {/* Five ticks: ink for the steps behind you, hairline for the rest.
              Decorative — the sentence above already says where you are. */}
          <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <span
                key={i}
                className={cn("h-1 flex-1 rounded-cv-xs", i < step ? "bg-cv-ink" : "bg-cv-line")}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {step === 1 && (
            <div className="flex flex-col gap-3">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-cv-lg border border-dashed bg-cv-surface-sunken p-10 text-center transition-colors duration-[120ms]",
                  "focus-visible:shadow-cv-focus-ring focus-visible:outline-none",
                  dropActive
                    ? "border-cv-accent bg-cv-accent-soft"
                    : "border-cv-border hover:border-cv-ink-muted",
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
                  <>
                    <FileSpreadsheet className="h-6 w-6 text-cv-ink-muted" aria-hidden="true" />
                    <span className="rounded-cv-sm bg-cv-surface px-2 py-1 font-cv-mono text-xs text-cv-ink">
                      {fileName}
                    </span>
                    <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                      Click to choose a different file
                    </p>
                  </>
                ) : (
                  <>
                    <Icon name="upload" size={24} className="text-cv-ink-muted" />
                    <p className="m-0 text-sm font-medium leading-5 text-cv-ink">
                      Drag your payroll file here
                    </p>
                    <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                      or click to browse
                    </p>
                  </>
                )}
              </div>
              <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                Supported formats: CSV, XLSX and XLS. One file per payroll period.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-cv-md bg-cv-surface-sunken px-3 py-2">
                <FileSpreadsheet
                  className="h-4 w-4 shrink-0 text-cv-ink-muted"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate font-cv-mono text-xs text-cv-ink">
                  {fileName}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  iconLeft="x"
                  aria-label="Choose a different file"
                  onClick={() => {
                    setStep(1);
                    setFileName(null);
                    setFileData(null);
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="upload-period-type"
                  className="text-[13px] font-medium leading-[18px] text-cv-ink"
                >
                  Period type
                </label>
                <Select
                  value={periodType}
                  onValueChange={(val) => setPeriodType(val as PeriodType)}
                >
                  <SelectTrigger id="upload-period-type">
                    {/* The trigger carries the short label on its own; the
                        glosses below are what tell "Bi-monthly" from
                        "Bi-weekly" at the moment of choosing. */}
                    <SelectValue>{PERIOD_TYPE_LABELS[periodType] ?? periodType}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} textValue={opt.label}>
                        <span className="flex items-baseline gap-2">
                          <span>{opt.label}</span>
                          {PERIOD_TYPE_HINTS[opt.value] && (
                            <span className="text-[13px] text-cv-ink-subtle">
                              {PERIOD_TYPE_HINTS[opt.value]}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {PERIOD_TYPE_HINTS[periodType] && (
                  <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                    {PERIOD_TYPE_HINTS[periodType]}.
                  </p>
                )}
              </div>

              {periodType === "monthly" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="upload-month"
                      className="text-[13px] font-medium leading-[18px] text-cv-ink"
                    >
                      Month
                    </label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger id="upload-month">
                        <SelectValue placeholder="Select month…" />
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
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="upload-year"
                      className="text-[13px] font-medium leading-[18px] text-cv-ink"
                    >
                      Year
                    </label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger id="upload-year">
                        <SelectValue placeholder="Select year…" />
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
                  <TextField
                    label="Start date"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <TextField
                    label="End date"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[13px] leading-[18px] text-cv-ink-muted">
                Every column of your file is listed below with a suggested mapping. Review and
                adjust: map a column to a pay component, or tick an identifier field (Employee ID
                and the rest) so employees can be matched between periods. A column marked as both a
                salary component <em>and</em> an identifier is treated as an identifier only.
              </p>

              <div className="flex flex-col gap-2">
                {mappings.map((mapping, idx) => (
                  <MappingRow
                    key={mapping.sourceColumn}
                    {...mapping}
                    sample={fileData?.[1]?.[idx] ?? null}
                    availableComponents={availableComponents}
                    alreadyAnswered={answeredQuery.data?.[mapping.mappedComponent] !== undefined}
                    aiConfidence={0.75 + (idx % 3) * 0.08}
                    onChange={(updated) =>
                      setMappings((prev) =>
                        prev.map((m) => (m.sourceColumn === updated.sourceColumn ? updated : m)),
                      )
                    }
                  />
                ))}
              </div>

              {/*
                Step 11b: why Next is disabled, said once rather than only on the
                rows. The rows carry the question; this is the count.
              */}
              {unansweredQuestions.length > 0 && (
                <Notice
                  tone="warning"
                  title={
                    unansweredQuestions.length === 1
                      ? "1 column needs a decision"
                      : `${unansweredQuestions.length} columns need a decision`
                  }
                >
                  Clarivo cannot tell which category{" "}
                  {unansweredQuestions.map((m) => m.mappedComponent).join(", ")} belongs to, and the
                  answer changes which report it appears in. Choose above. Your answer is saved for
                  this company, so you will not be asked again.
                </Notice>
              )}

              {/*
                Step 4's control total, asked here because this is the last step
                before the check: the admin still has the export they uploaded in
                front of them. Optional, and the next panel says "not supplied"
                rather than ticking it, because Clarivo's own totals can only ever
                agree with themselves.
              */}
              <div className="rounded-cv-md border border-cv-line bg-cv-surface p-3">
                <p className="m-0 text-[13px] font-medium leading-[18px] text-cv-ink">
                  Control totals from your payroll export{" "}
                  <span className="font-normal text-cv-ink-subtle">(optional)</span>
                </p>
                <p className="m-0 mt-0.5 text-[13px] leading-[18px] text-cv-ink-subtle">
                  The figures printed on the report you exported. Clarivo ticks what it adds up from
                  the rows against them, and refuses the import if they disagree.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <TextField
                    id="control-gross"
                    label="Total gross"
                    mono
                    inputMode="decimal"
                    value={controlGross}
                    onChange={(e) => setControlGross(e.target.value)}
                    placeholder="Leave blank to skip"
                  />
                  <TextField
                    id="control-net"
                    label="Total net"
                    mono
                    inputMode="decimal"
                    value={controlNet}
                    onChange={(e) => setControlNet(e.target.value)}
                    placeholder="Leave blank to skip"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && validationResult && (
            <div className="flex flex-col gap-4">
              {/* What the check read, before what it decided. Through the money
                  formatter, so a EUR register is not labelled in dollars. */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-cv-md bg-cv-surface-sunken p-3 sm:grid-cols-4">
                <div>
                  <dt className="m-0 text-xs font-medium leading-4 text-cv-ink-subtle">Rows</dt>
                  <dd className="cv-num m-0 mt-0.5 text-left text-cv-ink">
                    {validationResult.totalRows}
                  </dd>
                </div>
                <div>
                  <dt className="m-0 text-xs font-medium leading-4 text-cv-ink-subtle">
                    Employees
                  </dt>
                  <dd className="cv-num m-0 mt-0.5 text-left text-cv-ink">
                    {validationResult.employeeCount}
                  </dd>
                </div>
                <div>
                  <dt className="m-0 text-xs font-medium leading-4 text-cv-ink-subtle">
                    Total gross
                  </dt>
                  <dd className="cv-num m-0 mt-0.5 text-left text-cv-ink">
                    {formatCurrency(validationResult.totalGross, checkCurrency)}
                  </dd>
                </div>
                <div>
                  <dt className="m-0 text-xs font-medium leading-4 text-cv-ink-subtle">
                    Total net
                  </dt>
                  <dd className="cv-num m-0 mt-0.5 text-left text-cv-ink">
                    {formatCurrency(validationResult.totalNet, checkCurrency)}
                  </dd>
                </div>
              </dl>

              {/*
                Step 4: the two identities that define a correct register.
                Shown as a check each, with the figures, because "520.00 of
                earnings is not in your Gross column" is actionable and
                "1 error" is not.
              */}
              {validationResult.reconciliation && (
                <div className="rounded-cv-md border border-cv-line bg-cv-surface">
                  <p className="m-0 border-b border-cv-line px-3 py-2 text-[13px] font-medium leading-[18px] text-cv-ink-muted">
                    Data check
                  </p>
                  <ul className="m-0 list-none divide-y divide-cv-line p-0">
                    <CheckLine
                      passed={
                        !validationResult.errors.some((e) => e.message.includes("Gross says"))
                      }
                      label="Earnings add up to gross"
                      // Not a tick when nothing is mapped on that side: there
                      // is no statement to verify, and showing a tick would
                      // claim one.
                      muted={!validationResult.reconciliation.coverage.earnings}
                      detail={
                        validationResult.reconciliation.coverage.earnings
                          ? `${formatCurrency(validationResult.reconciliation.totals.earnings + validationResult.reconciliation.totals.unplaced, checkCurrency)} against ${formatCurrency(validationResult.reconciliation.totals.gross, checkCurrency)}`
                          : "No earnings columns mapped"
                      }
                    />
                    <CheckLine
                      passed={!validationResult.errors.some((e) => e.message.includes("Net says"))}
                      label="Gross minus deductions equals net"
                      muted={!validationResult.reconciliation.coverage.deductions}
                      detail={
                        validationResult.reconciliation.coverage.deductions
                          ? `${formatCurrency(validationResult.reconciliation.totals.gross - validationResult.reconciliation.totals.deductions, checkCurrency)} against ${formatCurrency(validationResult.reconciliation.totals.net, checkCurrency)}`
                          : "No deduction columns mapped"
                      }
                    />
                    <CheckLine
                      passed={
                        !validationResult.errors.some((e) => e.message.includes("is above gross"))
                      }
                      label="No net above its gross"
                    />
                    <CheckLine
                      passed={!validationResult.errors.some((e) => e.message.includes("net is"))}
                      label="No negative net"
                    />
                    <CheckLine
                      passed={
                        !validationResult.errors.some((e) =>
                          e.message.includes("Duplicate employee ID"),
                        )
                      }
                      label="No employee ID used twice"
                    />
                    <CheckLine
                      passed={validationResult.openQuestions.length === 0}
                      label="Every component has a category"
                      detail={
                        validationResult.openQuestions.length === 0
                          ? undefined
                          : validationResult.openQuestions.map((q) => q.componentKey).join(", ")
                      }
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
                <Notice
                  tone="danger"
                  title={
                    validationResult.errors.length === 1
                      ? "1 problem stops this import"
                      : `${validationResult.errors.length} problems stop this import`
                  }
                >
                  <p className="mb-2">
                    Nothing is saved until the register is corrected and re-uploaded.
                  </p>
                  <ul className="m-0 list-none space-y-1 p-0">
                    {validationResult.errors.slice(0, 8).map((e, i) => (
                      <li key={i} className="text-[13px] leading-[18px]">
                        {e.message}
                      </li>
                    ))}
                  </ul>
                  {validationResult.errors.length > 8 && (
                    <p className="mt-2 text-[13px] leading-[18px] text-cv-ink-muted">
                      and {validationResult.errors.length - 8} more.
                    </p>
                  )}
                </Notice>
              )}

              {validationResult.warnings.length > 0 && (
                <Notice
                  tone="warning"
                  title={
                    validationResult.warnings.length === 1
                      ? "1 thing worth a look"
                      : `${validationResult.warnings.length} things worth a look`
                  }
                >
                  <p className="mb-2">These do not stop the import.</p>
                  <ul className="m-0 list-none space-y-1 p-0">
                    {validationResult.warnings.slice(0, 6).map((w, i) => (
                      <li key={i} className="text-[13px] leading-[18px]">
                        {w.message}
                      </li>
                    ))}
                  </ul>
                  {validationResult.warnings.length > 6 && (
                    <p className="mt-2 text-[13px] leading-[18px] text-cv-ink-muted">
                      and {validationResult.warnings.length - 6} more.
                    </p>
                  )}
                </Notice>
              )}

              {validationResult.errors.length === 0 && validationResult.warnings.length === 0 && (
                <Notice tone="success" title="The register reconciles">
                  Both totals tie out to the {validationResult.detectedCurrency ?? "currency"}
                  &rsquo;s smallest unit. Ready to import.
                </Notice>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-3">
              {processing ? (
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                  <DriftStrip size="lg" count={24} animate="scan" label="Saving" />
                  <p className="m-0 text-sm font-medium leading-5 text-cv-ink">
                    Saving your payroll data…
                  </p>
                  <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                    This may take a few moments.
                  </p>
                </div>
              ) : importError ? (
                <Notice tone="danger" title="Import failed">
                  <p className="m-0">{importError}</p>
                  <p className="m-0 mt-1">
                    Nothing was saved. Go back to adjust the mapping, or try again.
                  </p>
                </Notice>
              ) : (
                <>
                  <Notice
                    tone="success"
                    title="Upload complete"
                    action={
                      <Button variant="secondary" size="sm" href="/dashboard">
                        Open the dashboard
                      </Button>
                    }
                  >
                    {importResult
                      ? `Saved ${importResult.employeeCount} employee${
                          importResult.employeeCount === 1 ? "" : "s"
                        } for this period.${
                          importResult.warnings > 0
                            ? ` ${importResult.warnings} warning${
                                importResult.warnings === 1 ? "" : "s"
                              } recorded.`
                            : ""
                        }`
                      : "Your payroll period has been saved."}
                  </Notice>

                  {/*
                    Step 9. A column the reader refused leaves its field empty,
                    and an empty field looks like a register that did not carry
                    the data. Saying which column and why is the difference
                    between "your file has no hire dates" and "fix the format".
                  */}
                  {importResult && importResult.columnIssues.length > 0 && (
                    <Notice tone="warning" title="The pay imported. These columns did not.">
                      <ul className="m-0 list-none space-y-1.5 p-0">
                        {importResult.columnIssues.map((issue, i) => (
                          <li
                            key={`${issue.sourceColumn}-${i}`}
                            className="text-[13px] leading-[18px]"
                          >
                            <span className="font-cv-mono text-xs">{issue.sourceColumn}</span>
                            {" — "}
                            {COLUMN_ISSUE_MESSAGES[issue.problem.code] ?? "could not be read."}
                            {issue.problem.samples.length > 0 && (
                              <span className="text-cv-ink-muted">
                                {" "}
                                e.g. {issue.problem.samples.join(", ")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </Notice>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/*
          "Create salary component", as the board draws it: its own dialog, so
          it traps focus and closes on Escape without taking the wizard with
          it. It was a hand-rolled `fixed inset-0` panel over a black scrim
          before, and it is still unreachable — `handleCreateComponent` has no
          caller, because `MappingRow` has never offered the option. That is
          how this screen arrived and wiring it up would be a new way to invent
          a component name mid-upload, which is a product decision rather than
          a restyle. Left exactly as reachable as it was, and no less.
        */}
        <Dialog
          open={createComponentColumn !== null}
          onOpenChange={(next) => {
            if (!next) setCreateComponentColumn(null);
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Create salary component</DialogTitle>
              <DialogDescription>
                Name the new salary component mapped from &ldquo;{createComponentColumn}&rdquo;.
              </DialogDescription>
            </DialogHeader>
            <TextField
              label="Component name"
              value={newComponentName}
              onChange={(e) => setNewComponentName(e.target.value)}
              placeholder="Component name…"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmCreateComponent();
              }}
              autoFocus
            />
            <DialogFooter className="sm:justify-end">
              <Button variant="secondary" size="sm" onClick={() => setCreateComponentColumn(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmCreateComponent}
                disabled={!newComponentName.trim()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DialogFooter className="items-center border-t border-cv-line pt-4 sm:justify-between">
          <p className="m-0 mb-3 text-[13px] leading-[18px] text-cv-ink-subtle sm:mb-0">
            {footerHint}
          </p>
          <div className="flex items-center gap-2">
            {(step < STEP_COUNT || importError) && (
              <Button
                variant="secondary"
                icon={<ArrowLeft />}
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
                Back
              </Button>
            )}
            {step === STEP_COUNT && importError ? (
              <Button icon={<RefreshCw />} onClick={() => void runImport()} disabled={processing}>
                Try again
              </Button>
            ) : step === STEP_COUNT ? (
              <Button onClick={() => handleOpenChangeWrapper(false)} disabled={processing}>
                Done
              </Button>
            ) : (
              <Button
                onClick={() => void handleNextStep()}
                disabled={nextDisabled}
                loading={validating || processing}
                iconLeft={step === 4 && !validating && !processing ? "check" : undefined}
                iconRight={step < 4 && !validating && !processing ? "arrow-right" : undefined}
              >
                {validating
                  ? "Checking…"
                  : processing
                    ? "Saving…"
                    : step === 4
                      ? "Confirm import"
                      : "Next"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
