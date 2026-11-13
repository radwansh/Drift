"use client";

import { Button } from "@/components/cv";
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
  availableColumns,
  EMPLOYEE_COLUMNS,
  type EmployeeColumnDef,
  type EmployeeColumnKey,
  type EmployeeListRow,
} from "@/components/employee-file/employee-columns";

/**
 * The list's column picker (step E4, finding F1).
 *
 * A new picker with its own key union, not `components/detailed-view/
 * column-picker.tsx`: that one's model carries a `mode` of
 * `current | previous | side_by_side | delta_only`, which is comparison
 * semantics with no meaning for a list column, so reusing it would render four
 * meaningless mode buttons per column.
 *
 * A column whose data is not in scope is listed as unavailable rather than
 * offered and then rendered blank — an always-blank column is worse than no
 * column, and a toggle that appears to do nothing is worse than both.
 */
export function EmployeeColumnPicker({
  rows,
  visible,
  onToggle,
  onReset,
}: {
  rows: readonly EmployeeListRow[];
  visible: readonly EmployeeColumnKey[];
  onToggle: (key: EmployeeColumnKey) => void;
  onReset: () => void;
}) {
  const available = availableColumns(rows);
  const unavailable: EmployeeColumnDef[] = EMPLOYEE_COLUMNS.filter(
    (column) => !available.includes(column),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" iconLeft="columns">
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={visible.includes(column.key)}
            disabled={column.locked}
            onCheckedChange={() => onToggle(column.key)}
            onSelect={(event) => event.preventDefault()}
            className="items-start"
          >
            <span className="flex flex-col gap-0.5">
              <span>{column.label}</span>
              {column.note && (
                <span className="text-xs leading-4 text-cv-ink-subtle">{column.note}</span>
              )}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        {unavailable.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-cv-ink-subtle">
              Not in this register
            </DropdownMenuLabel>
            {unavailable.map((column) => (
              <DropdownMenuItem key={column.key} disabled className="items-start">
                <span className="flex flex-col gap-0.5">
                  <span>{column.label}</span>
                  {column.note && (
                    <span className="text-xs leading-4 text-cv-ink-subtle">{column.note}</span>
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onReset()}>Reset to default</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
