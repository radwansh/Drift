"use client";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, XCircle, Brain } from "lucide-react";
import { cn, formatComponentName } from "@/lib/utils";

interface MappingRowProps {
  sourceColumn: string;
  mappedComponent: string;
  aiConfidence: number | null;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
  availableComponents: string[];
  onChange: (mapping: {
    sourceColumn: string;
    mappedComponent: string;
    isEmployeeId: boolean;
    isEmployeeName: boolean;
    isDepartment: boolean;
    isGrossSalary: boolean;
    isNetSalary: boolean;
  }) => void;
}

export function MappingRow({
  sourceColumn,
  mappedComponent,
  aiConfidence,
  isEmployeeId,
  isEmployeeName,
  isDepartment,
  isGrossSalary,
  isNetSalary,
  availableComponents,
  onChange,
}: MappingRowProps) {
  const isRequiredMissing =
    !mappedComponent ||
    mappedComponent === "ignore" ||
    (!isEmployeeId &&
      !isEmployeeName &&
      !isDepartment &&
      !isGrossSalary &&
      !isNetSalary);

  const update = (partial: Partial<{
    mappedComponent: string;
    isEmployeeId: boolean;
    isEmployeeName: boolean;
    isDepartment: boolean;
    isGrossSalary: boolean;
    isNetSalary: boolean;
  }>) => {
    onChange({
      sourceColumn,
      mappedComponent,
      isEmployeeId,
      isEmployeeName,
      isDepartment,
      isGrossSalary,
      isNetSalary,
      ...partial,
    });
  };

  const identifierFields: Array<{
    key: "isEmployeeId" | "isEmployeeName" | "isDepartment" | "isGrossSalary" | "isNetSalary";
    label: string;
  }> = [
    { key: "isEmployeeId", label: "Employee ID" },
    { key: "isEmployeeName", label: "Employee Name" },
    { key: "isDepartment", label: "Department" },
    { key: "isGrossSalary", label: "Gross Salary" },
    { key: "isNetSalary", label: "Net Salary" },
  ];

  return (
    <div className={cn(
      "rounded-lg border bg-card px-3 py-2.5 transition-colors space-y-2",
      isRequiredMissing && "border-destructive/30 bg-destructive/[0.02]",
    )}>
      <div className="flex items-center gap-2">
        <div className="flex w-36 items-center gap-2">
          <span className="flex-1 truncate text-sm font-medium" title={sourceColumn}>
            {sourceColumn}
          </span>
          {aiConfidence !== null && (
            <span
              className={cn(
                "flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium",
                aiConfidence >= 0.8
                  ? "bg-green-100 text-green-700"
                  : aiConfidence >= 0.5
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700",
              )}
            >
              <Brain className="h-3 w-3" />
              {Math.round(aiConfidence * 100)}%
            </span>
          )}
        </div>

        <div className="flex-1">
          <Select
            value={mappedComponent || ""}
            onValueChange={(val) => {
              update({ mappedComponent: val });
            }}
          >
            <SelectTrigger
              className={cn(
                "w-full",
                !mappedComponent && "text-muted-foreground",
                mappedComponent === "ignore" && "border-dashed",
              )}
            >
              <SelectValue placeholder="Select mapping..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ignore">Ignore column</SelectItem>
              {availableComponents.map((comp) => (
                <SelectItem key={comp} value={comp}>
                  {formatComponentName(comp)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="shrink-0">
          {isRequiredMissing ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : mappedComponent && mappedComponent !== "ignore" ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-500" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="w-full text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Identifiers</span>
        {identifierFields.map(({ key, label }) => {
          const checked = (() => {
            switch (key) {
              case "isEmployeeId": return isEmployeeId;
              case "isEmployeeName": return isEmployeeName;
              case "isDepartment": return isDepartment;
              case "isGrossSalary": return isGrossSalary;
              case "isNetSalary": return isNetSalary;
            }
          })();
          return (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer select-none items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                checked
                  ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => update({ [key]: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
              />
              {label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
