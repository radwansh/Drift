"use client";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, XCircle, Brain } from "lucide-react";
import { SNAPSHOT_FIELDS, type SnapshotField } from "@saas/payroll-core";
import { cn, formatComponentName } from "@/lib/utils";

/**
 * Step 9: what a column records, beyond the five identifier flags.
 *
 * One select rather than a checkbox each, because these roles are mutually
 * exclusive and the database says so — `company_column_mappings_one_role`
 * rejects a column that is both a typed field and a dimension. A checkbox grid
 * would let the UI offer a combination the write then refuses.
 */
const RECORD_AS_COMPONENT = "component";
const RECORD_AS_DIMENSION = "dimension";

const SNAPSHOT_FIELD_LABELS: Record<SnapshotField, string> = {
  hire_date: "Hire date",
  termination_date: "Termination date",
  fte: "FTE",
};

interface MappingRowProps {
  sourceColumn: string;
  mappedComponent: string;
  aiConfidence: number | null;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
  snapshotField?: SnapshotField | null;
  dimensionName?: string | null;
  availableComponents: string[];
  onChange: (mapping: {
    sourceColumn: string;
    mappedComponent: string;
    isEmployeeId: boolean;
    isEmployeeName: boolean;
    isDepartment: boolean;
    isGrossSalary: boolean;
    isNetSalary: boolean;
    snapshotField: SnapshotField | null;
    dimensionName: string | null;
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
  snapshotField = null,
  dimensionName = null,
  availableComponents,
  onChange,
}: MappingRowProps) {
  // Step 9: a column recorded as a date, an FTE or a dimension needs no pay
  // component, so the "pick a mapping" prompt does not apply to it. Everything
  // else below is the rule that was already here.
  const hasRecordRole = snapshotField !== null || dimensionName !== null;

  const isRequiredMissing =
    !hasRecordRole &&
    (!mappedComponent ||
      mappedComponent === "ignore" ||
      (!isEmployeeId &&
        !isEmployeeName &&
        !isDepartment &&
        !isGrossSalary &&
        !isNetSalary));

  const update = (partial: Partial<{
    mappedComponent: string;
    isEmployeeId: boolean;
    isEmployeeName: boolean;
    isDepartment: boolean;
    isGrossSalary: boolean;
    isNetSalary: boolean;
    snapshotField: SnapshotField | null;
    dimensionName: string | null;
  }>) => {
    onChange({
      sourceColumn,
      mappedComponent,
      isEmployeeId,
      isEmployeeName,
      isDepartment,
      isGrossSalary,
      isNetSalary,
      snapshotField,
      dimensionName,
      ...partial,
    });
  };

  const recordAs = snapshotField ?? (dimensionName !== null ? RECORD_AS_DIMENSION : RECORD_AS_COMPONENT);

  /**
   * A column is one thing. Taking a record role clears the identifier flags and
   * the component, so the UI cannot offer a combination the write would refuse
   * — the processor skips a record-role column when collecting components, and
   * `company_column_mappings_one_role` rejects two roles at once.
   */
  const setRecordRole = (partial: {
    snapshotField: SnapshotField | null;
    dimensionName: string | null;
  }) => {
    const clearing = partial.snapshotField === null && partial.dimensionName === null;
    update(
      clearing
        ? partial
        : {
            ...partial,
            mappedComponent: "",
            isEmployeeId: false,
            isEmployeeName: false,
            isDepartment: false,
            isGrossSalary: false,
            isNetSalary: false,
          },
    );
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
            disabled={hasRecordRole}
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

      {/*
        Step 9. A column can record a hire date, a termination date, an FTE or
        a reporting dimension instead of a pay component. Without this the
        upload had no way to populate those columns, so a hire date was
        classified and summed as money.
      */}
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Records
        </span>
        <Select
          value={recordAs}
          onValueChange={(val) => {
            if (val === RECORD_AS_DIMENSION) {
              // Seed the name from the column header: it is right most of the
              // time, and an empty box reads as a required field.
              setRecordRole({ snapshotField: null, dimensionName: dimensionName ?? sourceColumn });
            } else if (val === RECORD_AS_COMPONENT) {
              setRecordRole({ snapshotField: null, dimensionName: null });
            } else {
              setRecordRole({ snapshotField: val as SnapshotField, dimensionName: null });
            }
          }}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={RECORD_AS_COMPONENT}>Pay component</SelectItem>
            {SNAPSHOT_FIELDS.map((field) => (
              <SelectItem key={field} value={field}>
                {SNAPSHOT_FIELD_LABELS[field]}
              </SelectItem>
            ))}
            <SelectItem value={RECORD_AS_DIMENSION}>Reporting dimension</SelectItem>
          </SelectContent>
        </Select>

        {dimensionName !== null && (
          <input
            type="text"
            value={dimensionName}
            maxLength={100}
            placeholder="Dimension name"
            aria-label={`Dimension name for ${sourceColumn}`}
            onChange={(e) => update({ dimensionName: e.target.value })}
            className="h-8 flex-1 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        )}

        {snapshotField !== null && (
          <span className="text-[11px] text-muted-foreground">
            {snapshotField === "fte"
              ? "A fraction of a full post: 0.5 or 50%."
              : "Dates are read per column; an ambiguous column is reported, not guessed."}
          </span>
        )}
      </div>

      <div className={cn("flex flex-wrap items-center gap-1", hasRecordRole && "hidden")}>
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
