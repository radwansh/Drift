"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";
import { DEPARTMENT_RULE_NOTICE } from "@/components/employee-file/employee-file-text";
import {
  LIST_SCOPES,
  RANGE_KINDS,
  RANGE_LABELS,
  SCOPE_DEFINITIONS,
  type ListScope,
  type RangeKind,
} from "@/components/employee-file/employee-list-url";

interface ScopeOption {
  periodType: string;
  currency: string;
  periods: number;
}

/** One entry of the fiscal year's slot calendar, as the period picker reads it. */
interface SlotOption {
  index: number;
  label: string;
}

/**
 * The list's filters (step E3).
 *
 * Three things are deliberate about the layout. The **scope is a visible
 * segmented control**, never a hidden default, because which of the three sets
 * is on screen changes what the row count means. **Currency and cadence are a
 * scope selector, not a filter**: changing either recomputes everything and
 * values are never mixed, so they sit apart from the things that narrow a set.
 * And the department rule is **stated**, because "latest department" and "in
 * any slot in range" give different answers for anyone who transferred.
 *
 * The **period picker** appears beside the range whenever the range is "One
 * period". Without it that option showed a full year of money under a control
 * saying "One period" — the user's own requirement was that they "can select
 * another given period", and the range selector alone cannot express which.
 */
export function EmployeeListFilters({
  scope,
  onScopeChange,
  range,
  onRangeChange,
  slots,
  slotIndex,
  onSlotChange,
  query,
  onQueryChange,
  departments,
  selectedDepartments,
  onDepartmentsChange,
  dimensions,
  hasFlag,
  onHasFlagChange,
  scopeOptions,
  periodType,
  currency,
  onScopeOptionChange,
}: {
  scope: ListScope;
  onScopeChange: (scope: ListScope) => void;
  range: RangeKind;
  onRangeChange: (range: RangeKind) => void;
  /** The whole fiscal year's calendar, never the range's own narrowed slice. */
  slots: readonly SlotOption[];
  /** The slot the server resolved, so the trigger never contradicts the data. */
  slotIndex: number | null;
  onSlotChange: (slotIndex: number) => void;
  query: string;
  onQueryChange: (query: string) => void;
  departments: readonly string[];
  selectedDepartments: readonly string[];
  onDepartmentsChange: (departments: string[]) => void;
  dimensions: readonly { key: string; values: string[]; truncated: boolean }[];
  hasFlag: "critical" | "duplicate" | undefined;
  onHasFlagChange: (flag: "critical" | "duplicate" | undefined) => void;
  scopeOptions: readonly ScopeOption[];
  periodType: string;
  currency: string;
  onScopeOptionChange: (option: { periodType: string; currency: string }) => void;
}) {
  const scopeOptionValue = `${periodType}|${currency}`;

  return (
    <div className="space-y-3">
      {/* The scope, as a segmented control with its definition underneath. */}
      <div>
        <div
          role="group"
          aria-label="Who to list"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1"
        >
          {LIST_SCOPES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => onScopeChange(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                scope === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {SCOPE_DEFINITIONS[value].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {SCOPE_DEFINITIONS[scope].definition}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          {/* Controlled, with the debounce in the parent: the input itself is
              where the user's keystrokes live, and a debounce here plus a
              value from above is how a controlled field starts fighting the
              typing. */}
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Name or external id"
            aria-label="Search by name or external id"
            className="pl-8"
          />
        </div>

        <Select value={range} onValueChange={(value) => onRangeChange(value as RangeKind)}>
          <SelectTrigger aria-label="Range" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_KINDS.map((value) => (
              <SelectItem key={value} value={value}>
                {RANGE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/*
          Every period in the year, not the range's own slice. Narrowed to the
          selected slot, the picker collapsed to the one option already chosen
          with no way back to another period.

          `slotIndex` is the server's resolved value rather than a guess, since
          Radix only fires `onValueChange` when the value differs: a trigger
          showing a slot the response is not about makes clicking that slot a
          no-op, which is how the first period became unreachable.
        */}
        {range === "slot" && slots.length > 0 && (
          <Select
            value={slotIndex === null ? undefined : String(slotIndex)}
            onValueChange={(value) => onSlotChange(Number(value))}
          >
            <SelectTrigger aria-label="Period" className="w-36">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              {slots.map((slot) => (
                <SelectItem key={slot.index} value={String(slot.index)}>
                  {slot.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Not a filter: a scope. Changing it recomputes every figure, and two
            currencies are never mixed in one total. */}
        {scopeOptions.length > 1 && (
          <Select
            value={scopeOptionValue}
            onValueChange={(value) => {
              const [nextType, nextCurrency] = value.split("|");
              if (nextType && nextCurrency) {
                onScopeOptionChange({ periodType: nextType, currency: nextCurrency });
              }
            }}
          >
            <SelectTrigger aria-label="Cadence and currency" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeOptions.map((option) => (
                <SelectItem
                  key={`${option.periodType}|${option.currency}`}
                  value={`${option.periodType}|${option.currency}`}
                >
                  {PERIOD_TYPE_LABELS[option.periodType] ?? option.periodType} ·{" "}
                  {option.currency} ({option.periods})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Department
              {selectedDepartments.length > 0 && ` (${selectedDepartments.length})`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
            <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
              {DEPARTMENT_RULE_NOTICE}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {departments.length === 0 && (
              <DropdownMenuItem disabled>No departments in scope</DropdownMenuItem>
            )}
            {departments.map((department) => (
              <DropdownMenuCheckboxItem
                key={department}
                checked={selectedDepartments.includes(department)}
                onCheckedChange={() =>
                  onDepartmentsChange(
                    selectedDepartments.includes(department)
                      ? selectedDepartments.filter((d) => d !== department)
                      : [...selectedDepartments, department],
                  )
                }
                onSelect={(event) => event.preventDefault()}
              >
                {department}
              </DropdownMenuCheckboxItem>
            ))}
            {selectedDepartments.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDepartmentsChange([])}>
                  Clear
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Select
          value={hasFlag ?? "any"}
          onValueChange={(value) =>
            onHasFlagChange(value === "any" ? undefined : (value as "critical" | "duplicate"))
          }
        >
          <SelectTrigger aria-label="Flags" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any flags</SelectItem>
            <SelectItem value="critical">Critical only</SelectItem>
            <SelectItem value="duplicate">Duplicate rows only</SelectItem>
          </SelectContent>
        </Select>

        {/*
          Dimension pickers are discovered, never hardcoded: one per key that
          the registers in scope actually carry, so there is no Location filter
          unless that company has a Location column.

          They render disabled because `employeeFile.list` takes no dimension
          predicate yet — the dimension surface is deferred with the columns it
          belongs to (finding F9), and no register in the product carries a
          dimension today. Showing the keys that exist is what makes the gap
          visible the day one does; offering a picker that filters nothing
          would not.
        */}
        {dimensions.map((dimension) => (
          <DropdownMenu key={dimension.key}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {dimension.key}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
              <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                Filtering on {dimension.key} is not in this version. The values below are the
                ones in scope.
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {dimension.values.map((value) => (
                <DropdownMenuItem key={value} disabled>
                  {value}
                </DropdownMenuItem>
              ))}
              {dimension.truncated && (
                <DropdownMenuItem disabled>…and more</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      </div>
    </div>
  );
}
