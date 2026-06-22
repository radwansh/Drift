"use client";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className="flex w-44 items-center gap-2">
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
          onValueChange={(val) => update({ mappedComponent: val })}
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
              <SelectItem key={comp} value={comp} className="capitalize">
                {comp}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {identifierFields.map(({ key, label }) => (
          <label
            key={key}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors",
              (() => {
                const val = (() => {
                  switch (key) {
                    case "isEmployeeId": return isEmployeeId;
                    case "isEmployeeName": return isEmployeeName;
                    case "isDepartment": return isDepartment;
                    case "isGrossSalary": return isGrossSalary;
                    case "isNetSalary": return isNetSalary;
                  }
                })();
                return val
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted";
              })(),
            )}
          >
            <input
              type="checkbox"
              checked={(() => {
                switch (key) {
                  case "isEmployeeId": return isEmployeeId;
                  case "isEmployeeName": return isEmployeeName;
                  case "isDepartment": return isDepartment;
                  case "isGrossSalary": return isGrossSalary;
                  case "isNetSalary": return isNetSalary;
                }
              })()}
              onChange={(e) =>
                update({ [key]: e.target.checked })
              }
              className="h-3 w-3 rounded"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="shrink-0">
        {mappedComponent && mappedComponent !== "ignore" ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-amber-500" />
        )}
      </div>
    </div>
  );
}
