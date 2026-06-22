"use client";

import { useState, useCallback, useRef } from "react";
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
import { Input } from "@/components/ui/input";
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
  CalendarDays,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodType, DataSource } from "@saas/types";
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

const AVAILABLE_COMPONENTS = [
  "salary",
  "bonus",
  "benefits",
  "overtime",
  "commission",
  "allowance",
  "deduction",
  "reimbursement",
  "stipend",
  "other",
];

const PERIOD_TYPE_OPTIONS = Object.entries(PERIOD_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function UploadModal({ open, onOpenChange }: UploadModalProps) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<string[][] | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mappings, setMappings] = useState<ColumnMappingState[]>([]);
  const [saveMapping, setSaveMapping] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const simulateAiSuggestions = useCallback((headers: string[]) => {
    const aiMap: Record<string, Partial<ColumnMappingState>> = {
      "Employee ID": { mappedComponent: "salary", isEmployeeId: true },
      "Employee Name": { mappedComponent: "salary", isEmployeeName: true },
      "Department": { mappedComponent: "salary", isDepartment: true },
      "Gross Salary": { mappedComponent: "salary", isGrossSalary: true },
      "Net Salary": { mappedComponent: "salary", isNetSalary: true },
      Salary: { mappedComponent: "salary" },
      Bonus: { mappedComponent: "bonus" },
      Benefits: { mappedComponent: "benefits" },
      Overtime: { mappedComponent: "overtime" },
      Commission: { mappedComponent: "commission" },
      Allowance: { mappedComponent: "allowance" },
      Deduction: { mappedComponent: "deduction" },
    };

    return headers.map((header) => {
      const trimmed = header.trim();
      const ai = aiMap[trimmed] ?? {};
      return {
        sourceColumn: trimmed || header,
        mappedComponent: ai.mappedComponent ?? "",
        isEmployeeId: ai.isEmployeeId ?? false,
        isEmployeeName: ai.isEmployeeName ?? false,
        isDepartment: ai.isDepartment ?? false,
        isGrossSalary: ai.isGrossSalary ?? false,
        isNetSalary: ai.isNetSalary ?? false,
      };
    });
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["csv", "xlsx", "xls"].includes(ext)) return;

      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim());
        const data = lines.map((l) => l.split(",").map((c) => c.trim()));

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
        setTimeout(() => {
          const mockHeaders = ["Employee ID", "Employee Name", "Department", "Salary", "Bonus", "Benefits"];
          setFileName(file.name);
          setFileData([mockHeaders]);
          setMappings(simulateAiSuggestions(mockHeaders));
          setValidationResult(null);
          setStep(2);
        }, 500);
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
      if (!dateFrom || !dateTo) return;
      setStep(3);
    } else if (step === 3) {
      setValidating(true);
      setTimeout(() => {
        setValidationResult({
          totalRows: 16,
          employeeCount: 16,
          totalGross: 1620000,
          totalNet: 1182000,
          errors: 0,
          warnings: 2,
        });
        setValidating(false);
        setStep(4);
      }, 1000);
    } else if (step === 4) {
      setProcessing(true);
      setTimeout(() => {
        setProcessing(false);
        setStep(5);
      }, 2500);
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
    setDateFrom("");
    setDateTo("");
    setMappings([]);
    setSaveMapping(false);
    setValidating(false);
    setProcessing(false);
    setValidationResult(null);
  };

  const handleOpenChangeWrapper = (open: boolean) => {
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
      <DialogContent className="sm:max-w-[700px]">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="text"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="text"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
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
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {mappings.map((mapping) => (
                <MappingRow
                  key={mapping.sourceColumn}
                  {...mapping}
                  availableComponents={AVAILABLE_COMPONENTS}
                  aiConfidence={Math.random() * 0.4 + 0.6}
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
            <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={saveMapping}
                onChange={(e) => setSaveMapping(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              Skip mapping for future uploads
            </label>
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
            {step < 5 && (
              <Button
                onClick={step === 5 ? () => handleOpenChangeWrapper(false) : handleNextStep}
                disabled={
                  (step === 2 && (!dateFrom || !dateTo)) ||
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
                ) : step === 5 ? (
                  "Done"
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
