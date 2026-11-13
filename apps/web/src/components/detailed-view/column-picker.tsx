"use client";

import { useState } from "react";
import { Button, SegmentedControl } from "@/components/cv";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatComponentName } from "@/lib/utils";

/**
 * The Detailed View's column picker, on Ink & Signal (canvas board "Detailed
 * View").
 *
 * **Its model is comparison semantics and is not shared.** A column is
 * `{component, visible, mode}` where `mode` is `current | previous |
 * side_by_side | delta_only` — which periods of the comparison that column
 * shows. CLAUDE.md is explicit that this is not the Employee File's picker
 * (`employee-column-picker.tsx`, its own key union): a list column has no
 * "previous period", so reusing this one there renders four meaningless mode
 * buttons per column. The two stay apart deliberately.
 *
 * The rebuild is presentation only. Same props, same four handlers, same
 * mode values, same `visible` flags — only the markup moved onto `cv`
 * components: the trigger is a secondary Button, visibility is the design
 * system's Checkbox (the old one was a bare `<input>` with `border-gray-300`,
 * which is the legacy palette the guard exists to catch), and the four modes
 * are a `SegmentedControl`, so the chosen mode is announced with
 * `aria-pressed` rather than only coloured.
 */

export type ColumnMode = "current" | "previous" | "side_by_side" | "delta_only";

export interface ColumnConfig {
  component: string;
  visible: boolean;
  mode: ColumnMode;
}

interface ColumnPickerProps {
  columns: ColumnConfig[];
  onChange: (columns: ColumnConfig[]) => void;
}

/** Sentence case, per the design system's voice. The four values are unchanged. */
const MODE_OPTIONS: { value: ColumnMode; label: string }[] = [
  { value: "current", label: "Current only" },
  { value: "previous", label: "Previous only" },
  { value: "side_by_side", label: "Side by side" },
  { value: "delta_only", label: "Change only" },
];

export function ColumnPicker({ columns, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const visibleCount = columns.filter((c) => c.visible).length;

  const toggleColumn = (component: string) => {
    onChange(columns.map((c) => (c.component === component ? { ...c, visible: !c.visible } : c)));
  };

  const setMode = (component: string, mode: ColumnMode) => {
    onChange(columns.map((c) => (c.component === component ? { ...c, mode, visible: true } : c)));
  };

  const selectAll = () => {
    onChange(columns.map((c) => ({ ...c, visible: true })));
  };

  const deselectAll = () => {
    onChange(columns.map((c) => ({ ...c, visible: false })));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" iconLeft="columns">
          Columns
          {columns.length > 0 && (
            <span className="ml-1.5 font-cv-mono text-[13px] font-normal tabular-nums text-cv-ink-subtle">
              · {visibleCount} of {columns.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0" align="end">
        <div className="flex items-center justify-between gap-2 border-b border-cv-line px-4 py-3">
          <span className="text-sm font-semibold leading-5 text-cv-ink">Columns</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={deselectAll}>
              Clear all
            </Button>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {columns.length === 0 && (
            <p className="m-0 px-2 py-6 text-center text-sm leading-5 text-cv-ink-subtle">
              No salary components available
            </p>
          )}
          {columns.map((col) => {
            const checkboxId = `column-${col.component}`;
            return (
              <div
                key={col.component}
                className={cn(
                  "rounded-cv-md px-2 py-2 transition-colors duration-[120ms]",
                  col.visible ? "bg-cv-surface-sunken" : "hover:bg-cv-surface-sunken",
                )}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={checkboxId}
                    checked={col.visible}
                    onCheckedChange={() => toggleColumn(col.component)}
                  />
                  <label
                    htmlFor={checkboxId}
                    className="flex-1 cursor-pointer text-sm font-medium leading-5 text-cv-ink"
                  >
                    {formatComponentName(col.component)}
                  </label>
                </div>
                {col.visible && (
                  /* Scrolls sideways rather than widening the popover past a
                     narrow screen — the same escape the Employee File toolbar
                     uses for its scope control. */
                  <div className="-mx-1 mt-1.5 max-w-full overflow-x-auto px-1">
                    <SegmentedControl
                      size="sm"
                      label={`${formatComponentName(col.component)} columns to show`}
                      options={MODE_OPTIONS}
                      value={col.mode}
                      onChange={(value) => setMode(col.component, value as ColumnMode)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
