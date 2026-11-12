"use client";

import { Button, Icon, SegmentedControl } from "@/components/cv";
import { Input } from "@/components/ui/input";
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
 * The list's filters (step E3), on Ink & Signal (canvas board "Employee File:
 * list").
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
 *
 * The board splits the controls in two, which is the only change here: what
 * chooses the **set** (scope, range, period, cadence and currency, free text)
 * is the toolbar above the panel; what **narrows** it (department, flags) is
 * `EmployeeListTableFilters`, in the panel's own bar above the table it filters.
 * Same props, same handlers, same URL state.
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
  scopeOptions: readonly ScopeOption[];
  periodType: string;
  currency: string;
  onScopeOptionChange: (option: { periodType: string; currency: string }) => void;
}) {
  const scopeOptionValue = `${periodType}|${currency}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-cv-lg border border-cv-line bg-cv-surface px-4 py-3">
        {/* Scrolls sideways rather than overflowing the toolbar on a 360px phone. */}
        <div className="-mx-1 max-w-full overflow-x-auto px-1">
          <SegmentedControl
            label="Who to list"
            options={LIST_SCOPES.map((value) => ({
              value,
              label: SCOPE_DEFINITIONS[value].label,
            }))}
            value={scope}
            onChange={(value) => onScopeChange(value as ListScope)}
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
                  {PERIOD_TYPE_LABELS[option.periodType] ?? option.periodType} · {option.currency} (
                  {option.periods})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative min-w-[16rem] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cv-ink-subtle"
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
            className="pl-9"
          />
        </div>
      </div>

      {/* The definition of the set on screen, under the control that chose it. */}
      <p className="m-0 mt-2 text-[13px] leading-[18px] text-cv-ink-subtle">
        {SCOPE_DEFINITIONS[scope].definition}
      </p>
    </div>
  );
}

/**
 * The filters that narrow the set, in the table panel's bar (board: the row
 * above the table).
 *
 * The department picker stays a multi-select menu rather than becoming a
 * `Select`: one person can hold several departments across a year, and the
 * existing filter takes a list. A single-value control would be a behaviour
 * change dressed as a restyle.
 *
 * "Clear" is one call into the parent, never two — `onDepartmentsChange` and
 * `onHasFlagChange` each write the whole query string from the same snapshot,
 * so calling both in a row would have the second drop the first's change.
 */
export function EmployeeListTableFilters({
  departments,
  selectedDepartments,
  onDepartmentsChange,
  dimensions,
  hasFlag,
  onHasFlagChange,
  onClearFilters,
}: {
  departments: readonly string[];
  selectedDepartments: readonly string[];
  onDepartmentsChange: (departments: string[]) => void;
  dimensions: readonly { key: string; values: string[]; truncated: boolean }[];
  hasFlag: "critical" | "duplicate" | undefined;
  onHasFlagChange: (flag: "critical" | "duplicate" | undefined) => void;
  onClearFilters: () => void;
}) {
  const narrowed = selectedDepartments.length > 0 || hasFlag !== undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            Department
            {selectedDepartments.length > 0 && ` (${selectedDepartments.length})`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
          <DropdownMenuLabel className="text-xs font-normal text-cv-ink-subtle">
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
              <DropdownMenuItem onSelect={() => onDepartmentsChange([])}>Clear</DropdownMenuItem>
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
        <SelectTrigger aria-label="Flags" className="h-8 w-44 text-[13px]">
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
            <Button variant="secondary" size="sm">
              {dimension.key}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
            <DropdownMenuLabel className="text-xs font-normal text-cv-ink-subtle">
              Filtering on {dimension.key} is not in this version. The values below are the ones in
              scope.
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {dimension.values.map((value) => (
              <DropdownMenuItem key={value} disabled>
                {value}
              </DropdownMenuItem>
            ))}
            {dimension.truncated && <DropdownMenuItem disabled>…and more</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}

      {narrowed && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          Clear
        </Button>
      )}
    </>
  );
}
