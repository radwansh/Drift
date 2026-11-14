"use client";

import { useId } from "react";
import { Badge, Icon } from "@/components/cv";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  SNAPSHOT_FIELDS,
  ambiguityFor,
  CATEGORY_LABELS,
  type Category,
  type SnapshotField,
} from "@saas/payroll-core";
import { cn, formatComponentName } from "@/lib/utils";

/**
 * One column of the uploaded file, on Ink & Signal (canvas board "Upload
 * payroll file", step 3).
 *
 * The board's row is: the source column over a sample of its values, an arrow,
 * the mapping select, then the role select and the suggestion's confidence in
 * Geist Mono. The rebuild changed the colours and the shape and nothing else —
 * every rule below (the record role clearing the identifier flags, the
 * ambiguity question keyed on the mapped component, the required-mapping
 * state) is the one that was here before.
 *
 * The one colour that was deliberately dropped is the confidence chip's
 * green/amber/red tiering. The number it tiered is `0.75 + (index % 3) * 0.08`
 * — a function of the row's position in the file, not of anything about the
 * column — and painting a fabricated figure in status colours makes it read
 * as a measurement. It stays (nothing about behaviour changed) as a mono
 * figure in ink-subtle, where it reads as the hint it is.
 */

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

const RECORD_AS_LABELS: Record<string, string> = {
  [RECORD_AS_COMPONENT]: "Pay component",
  [RECORD_AS_DIMENSION]: "Reporting dimension",
  ...SNAPSHOT_FIELD_LABELS,
};

interface MappingRowProps {
  sourceColumn: string;
  mappedComponent: string;
  aiConfidence: number | null;
  /** The first value under this header, as it was read from the file. */
  sample?: string | null;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
  snapshotField?: SnapshotField | null;
  dimensionName?: string | null;
  /** Step 11b: the category the admin chose for a column nobody can place. */
  resolvedCategory?: Category | null;
  /** Already decided for this company, so the question is not asked again. */
  alreadyAnswered?: boolean;
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
    resolvedCategory: Category | null;
  }) => void;
}

export function MappingRow({
  sourceColumn,
  mappedComponent,
  aiConfidence,
  sample = null,
  isEmployeeId,
  isEmployeeName,
  isDepartment,
  isGrossSalary,
  isNetSalary,
  snapshotField = null,
  dimensionName = null,
  resolvedCategory = null,
  alreadyAnswered = false,
  availableComponents,
  onChange,
}: MappingRowProps) {
  const fieldId = useId();

  // Step 9: a column recorded as a date, an FTE or a dimension needs no pay
  // component, so the "pick a mapping" prompt does not apply to it. Everything
  // else below is the rule that was already here.
  const hasRecordRole = snapshotField !== null || dimensionName !== null;

  const isIdentifier =
    isEmployeeId || isEmployeeName || isDepartment || isGrossSalary || isNetSalary;

  const isRequiredMissing =
    !hasRecordRole && (!mappedComponent || mappedComponent === "ignore" || !isIdentifier);

  /**
   * Step 11b: the question, asked here rather than on the annual dashboard.
   *
   * It is keyed on the component the column is mapped *to*, because that is
   * what the classifier sees and what the answer is saved against — renaming
   * `Maladie` to `Sick Leave` in the dropdown is itself an answer. Nothing to
   * ask when the column is not a pay component at all.
   */
  const ambiguity =
    hasRecordRole || isIdentifier || mappedComponent === "" || mappedComponent === "ignore"
      ? undefined
      : ambiguityFor(mappedComponent);
  const needsAnswer = ambiguity !== undefined && !alreadyAnswered && resolvedCategory === null;

  const update = (
    partial: Partial<{
      mappedComponent: string;
      isEmployeeId: boolean;
      isEmployeeName: boolean;
      isDepartment: boolean;
      isGrossSalary: boolean;
      isNetSalary: boolean;
      snapshotField: SnapshotField | null;
      dimensionName: string | null;
      resolvedCategory: Category | null;
    }>,
  ) => {
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
      resolvedCategory,
      ...partial,
    });
  };

  const recordAs =
    snapshotField ?? (dimensionName !== null ? RECORD_AS_DIMENSION : RECORD_AS_COMPONENT);

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
    { key: "isEmployeeName", label: "Employee name" },
    { key: "isDepartment", label: "Department" },
    { key: "isGrossSalary", label: "Gross salary" },
    { key: "isNetSalary", label: "Net salary" },
  ];

  /** The mapping's state, as an icon with a word (never colour on its own). */
  const status = isRequiredMissing
    ? {
        icon: "x-circle" as const,
        tone: "text-cv-danger-ink",
        word: "Needs a mapping or an identifier",
      }
    : mappedComponent && mappedComponent !== "ignore"
      ? { icon: "check-circle" as const, tone: "text-cv-success-ink", word: "Mapped" }
      : { icon: "alert" as const, tone: "text-cv-warning-ink", word: "Not imported" };

  return (
    <div
      className={cn(
        "space-y-2 rounded-cv-md border border-cv-line bg-cv-surface px-3 py-2.5 transition-colors duration-[120ms]",
        isRequiredMissing && "border-cv-danger",
        // Step 11b: an unanswered question blocks the import, so the row has to
        // look like something that needs doing.
        needsAnswer && "border-cv-warning",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="w-32 min-w-0 shrink-0">
          <p
            className="m-0 truncate text-sm font-medium leading-5 text-cv-ink"
            title={sourceColumn}
          >
            {sourceColumn}
          </p>
          {/* The first value under the header, so the admin can tell two
              similarly named columns apart without reopening the file. */}
          {sample !== null && sample !== "" && (
            <p
              className="m-0 truncate font-cv-mono text-xs leading-4 text-cv-ink-subtle"
              title={sample}
            >
              {sample}
            </p>
          )}
        </div>

        <Icon name="arrow-right" size={16} className="shrink-0 text-cv-ink-subtle" />

        <div className="min-w-0 flex-1">
          <Select
            value={mappedComponent || ""}
            disabled={hasRecordRole}
            onValueChange={(val) => {
              // Step 11b: the answer was given for the old component name, so
              // it does not carry to a new one. Mapping `Maladie` to
              // `Sick Leave` is itself an answer and raises no question.
              update({ mappedComponent: val, resolvedCategory: null });
            }}
          >
            <SelectTrigger
              aria-label={`What ${sourceColumn} maps to`}
              className={cn("h-9 w-full", mappedComponent === "ignore" && "border-dashed")}
            >
              <SelectValue placeholder="Select mapping…" />
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

        <span className="flex shrink-0 items-center" title={status.word}>
          <Icon name={status.icon} size={16} className={status.tone} />
          <span className="sr-only">{status.word}</span>
        </span>
      </div>

      {/*
        Step 11b. The question goes here, where the mapping is made, not on the
        annual dashboard: the admin who just exported this register knows the
        answer, and asking afterwards means the ambiguity is already in the data
        and every annual view carries the gap until somebody replies.
      */}
      {ambiguity && (
        <div
          className={cn(
            "rounded-cv-md px-2.5 py-2",
            needsAnswer ? "bg-cv-warning-soft" : "bg-cv-surface-sunken",
          )}
        >
          <p className="m-0 flex items-start gap-1.5 text-[13px] leading-[18px] text-cv-ink">
            <Icon name="info" size={16} className="mt-px shrink-0 text-cv-ink-muted" />
            <span>
              <span className="font-semibold">{mappedComponent}</span> {ambiguity.question}
            </span>
          </p>
          {alreadyAnswered ? (
            <p className="m-0 mt-1.5 pl-[22px] text-[13px] leading-[18px] text-cv-ink-subtle">
              Already answered for this company, in Settings → Categories.
            </p>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[22px]">
              {ambiguity.candidates.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={resolvedCategory === candidate}
                  onClick={() =>
                    update({
                      // Clicking the chosen one again clears it, so a
                      // misclick is undoable without reloading the file.
                      resolvedCategory: resolvedCategory === candidate ? null : candidate,
                    })
                  }
                  className={cn(
                    "rounded-cv-md px-2 py-1 text-xs font-semibold transition-colors duration-[120ms]",
                    "focus-visible:shadow-cv-focus-ring focus-visible:outline-none",
                    resolvedCategory === candidate
                      ? "bg-cv-primary text-cv-on-primary"
                      : "border border-cv-border bg-cv-surface text-cv-ink hover:bg-cv-surface-sunken",
                  )}
                >
                  {CATEGORY_LABELS[candidate]}
                </button>
              ))}
              {needsAnswer && (
                <span className="flex items-center gap-1 text-[13px] leading-[18px] text-cv-danger-ink">
                  <Icon name="x-circle" size={14} />
                  Required before importing.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/*
        Step 9. A column can record a hire date, a termination date, an FTE or
        a reporting dimension instead of a pay component. Without this the
        upload had no way to populate those columns, so a hire date was
        classified and summed as money.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 shrink-0 text-xs font-medium leading-4 text-cv-ink-subtle">
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
          <SelectTrigger
            aria-label={`What ${sourceColumn} records`}
            className="h-8 w-44 text-[13px]"
          >
            {/* The trigger names the role on its own, so the items can carry
                their one-line gloss without it leaking into the closed
                control. */}
            <SelectValue>{RECORD_AS_LABELS[recordAs] ?? recordAs}</SelectValue>
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
            className="h-8 min-w-0 flex-1 rounded-cv-md border border-cv-border bg-cv-surface px-2 text-[13px] text-cv-ink transition-[border-color,box-shadow] placeholder:text-cv-ink-subtle hover:border-cv-ink-muted focus-visible:border-cv-accent focus-visible:shadow-cv-focus-ring focus-visible:outline-none"
          />
        )}

        {snapshotField !== null && (
          <span className="text-[13px] leading-[18px] text-cv-ink-subtle">
            {snapshotField === "fte"
              ? "A fraction of a full post: 0.5 or 50%."
              : "Dates are read per column; an ambiguous column is reported, not guessed."}
          </span>
        )}

        {/* The suggestion's own confidence, in mono, as the board draws it. */}
        {aiConfidence !== null && (
          <Badge tone="neutral" className="ml-auto font-cv-mono tabular-nums">
            AI {Math.round(aiConfidence * 100)}%
          </Badge>
        )}
      </div>

      <div className={cn("flex flex-wrap items-center gap-1.5", hasRecordRole && "hidden")}>
        <span className="w-16 shrink-0 text-xs font-medium leading-4 text-cv-ink-subtle">
          Identifiers
        </span>
        {identifierFields.map(({ key, label }) => {
          const checked = (() => {
            switch (key) {
              case "isEmployeeId":
                return isEmployeeId;
              case "isEmployeeName":
                return isEmployeeName;
              case "isDepartment":
                return isDepartment;
              case "isGrossSalary":
                return isGrossSalary;
              case "isNetSalary":
                return isNetSalary;
            }
          })();
          const id = `${fieldId}-${key}`;
          return (
            <span
              key={key}
              className={cn(
                "flex select-none items-center gap-1.5 rounded-cv-md px-2 py-1 text-xs font-medium transition-colors duration-[120ms]",
                checked
                  ? "bg-cv-accent-soft text-cv-accent ring-1 ring-cv-accent"
                  : "text-cv-ink-muted hover:bg-cv-surface-sunken hover:text-cv-ink",
              )}
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(next) => update({ [key]: next === true })}
              />
              <label htmlFor={id} className="cursor-pointer">
                {label}
              </label>
            </span>
          );
        })}
      </div>
    </div>
  );
}
