"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Columns, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

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

const MODE_LABELS: Record<ColumnMode, string> = {
  current: "Current Only",
  previous: "Previous Only",
  side_by_side: "Side by Side",
  delta_only: "Delta Only",
};

export function ColumnPicker({ columns, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const visibleCount = columns.filter((c) => c.visible).length;

  const toggleColumn = (component: string) => {
    onChange(
      columns.map((c) =>
        c.component === component ? { ...c, visible: !c.visible } : c,
      ),
    );
  };

  const setMode = (component: string, mode: ColumnMode) => {
    onChange(
      columns.map((c) =>
        c.component === component ? { ...c, mode, visible: true } : c,
      ),
    );
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
        <Button variant="outline" size="sm">
          <Columns className="h-4 w-4 mr-2" />
          Columns
          <span className="ml-1.5 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
            {visibleCount}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Column Visibility</span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-primary hover:underline"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="text-xs text-muted-foreground hover:underline"
            >
              Deselect All
            </button>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {columns.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No salary components available
            </p>
          )}
          {columns.map((col) => (
            <div
              key={col.component}
              className={cn(
                "rounded-md px-2 py-2 transition-colors",
                col.visible ? "bg-accent/30" : "hover:bg-accent/20",
              )}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleColumn(col.component)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="flex-1 text-sm font-medium capitalize">
                  {col.component}
                </span>
                {col.visible ? (
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              {col.visible && (
                <div className="ml-6 mt-1.5 flex flex-wrap gap-1">
                  {(
                    ["current", "previous", "side_by_side", "delta_only"] as ColumnMode[]
                  ).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setMode(col.component, mode)}
                      className={cn(
                        "rounded px-2 py-0.5 text-xs transition-colors",
                        col.mode === mode
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
