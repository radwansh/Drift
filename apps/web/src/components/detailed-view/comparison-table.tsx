"use client";

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
  type ExpandedState,
} from "@tanstack/react-table";
import type { ComparisonOutput, ComponentDelta } from "@saas/payroll-core";
import { formatCurrency, formatPercentage, formatComponentName } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, ChevronsUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { EmployeeDetailRow } from "./employee-detail-row";
import type { ColumnConfig, ColumnMode } from "./column-picker";

interface ComparisonTableProps {
  data: ComparisonOutput[];
  columnConfig: ColumnConfig[];
  loading: boolean;
}

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "info" | "secondary" | "default" }> = {
  unchanged: { label: "Unchanged", variant: "secondary" },
  increased: { label: "Increased", variant: "success" },
  decreased: { label: "Decreased", variant: "warning" },
  new: { label: "New", variant: "info" },
  departed: { label: "Departed", variant: "default" },
};

function DeltaCell({ delta }: { delta: ComponentDelta }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-right tabular-nums text-muted-foreground">
        {delta.previousValue !== null ? formatCurrency(delta.previousValue) : "\u2014"}
      </span>
      <span className="text-xs text-muted-foreground/50">&rarr;</span>
      <span className="w-24 text-right tabular-nums">
        {delta.currentValue !== null ? formatCurrency(delta.currentValue) : "\u2014"}
      </span>
      <span
        className={`w-20 text-right tabular-nums text-xs font-medium ${
          delta.absoluteDiff !== null
            ? delta.absoluteDiff > 0
              ? "text-green-600"
              : delta.absoluteDiff < 0
                ? "text-red-600"
                : "text-muted-foreground"
            : "text-muted-foreground"
        }`}
      >
        {delta.absoluteDiff !== null
          ? `${delta.absoluteDiff > 0 ? "+" : ""}${formatCurrency(delta.absoluteDiff)}`
          : "\u2014"}
      </span>
    </div>
  );
}

function CurrentOnlyCell({ delta }: { delta: ComponentDelta }) {
  return (
    <span className="tabular-nums">
      {delta.currentValue !== null ? formatCurrency(delta.currentValue) : "\u2014"}
    </span>
  );
}

function PreviousOnlyCell({ delta }: { delta: ComponentDelta }) {
  return (
    <span className="tabular-nums">
      {delta.previousValue !== null ? formatCurrency(delta.previousValue) : "\u2014"}
    </span>
  );
}

function DeltaOnlyCell({ delta }: { delta: ComponentDelta }) {
  return (
    <span
      className={`tabular-nums ${
        delta.absoluteDiff !== null
          ? delta.absoluteDiff > 0
            ? "text-green-600"
            : delta.absoluteDiff < 0
              ? "text-red-600"
              : "text-muted-foreground"
          : "text-muted-foreground"
      }`}
    >
      {delta.absoluteDiff !== null
        ? `${delta.absoluteDiff > 0 ? "+" : ""}${formatCurrency(delta.absoluteDiff)}`
        : "\u2014"}
    </span>
  );
}

function getComponentDelta(row: ComparisonOutput, component: string): ComponentDelta | undefined {
  if (component === "gross_salary") {
    return {
      component: "gross_salary",
      previousValue: row.previousGross ?? null,
      currentValue: row.currentGross ?? null,
      absoluteDiff: row.grossDelta,
      percentageDiff: row.previousGross && row.currentGross ? ((row.currentGross - row.previousGross) / row.previousGross) * 100 : null,
    };
  }
  if (component === "net_salary") {
    return {
      component: "net_salary",
      previousValue: row.previousNet ?? null,
      currentValue: row.currentNet ?? null,
      absoluteDiff: row.netDelta,
      percentageDiff: row.previousNet && row.currentNet ? ((row.currentNet - row.previousNet) / row.previousNet) * 100 : null,
    };
  }
  return row.componentDeltas.find((d) => d.component === component);
}

export function ComparisonTable({ data, columnConfig, loading }: ComparisonTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const visibleComponents = useMemo(
    () => columnConfig.filter((c) => c.visible).map((c) => c.component),
    [columnConfig],
  );

  const componentModes = useMemo(() => {
    const map: Record<string, ColumnMode> = {};
    for (const c of columnConfig) {
      if (c.visible) map[c.component] = c.mode;
    }
    return map;
  }, [columnConfig]);

  const columns = useMemo<ColumnDef<ComparisonOutput>[]>(() => [
    {
      id: "expander",
      header: () => null,
      cell: ({ row }) =>
        row.getCanExpand() ? (
          <button
            onClick={row.getToggleExpandedHandler()}
            className="rounded p-0.5 hover:bg-muted"
          >
            {row.getIsExpanded() ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : null,
      enableSorting: false,
      size: 32,
    },
    {
      accessorKey: "employeeExternalId",
      header: "Employee ID",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: "employeeName",
      header: "Employee Name",
      cell: ({ getValue }) => (
        <span className="font-medium">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: "department",
      header: "Department",
      cell: ({ getValue }) => {
        const dept = getValue() as string | null;
        return dept ?? <span className="text-muted-foreground">\u2014</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const status = getValue() as string;
        const badge = STATUS_BADGE[status] ?? { label: status, variant: "default" as const };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    ...visibleComponents.map((component): ColumnDef<ComparisonOutput> => ({
      id: component,
      header: () => <span>{formatComponentName(component)}</span>,
      cell: ({ row }) => {
        const delta = getComponentDelta(row.original, component);
        if (!delta) {
          const val =
            row.original.currentComponents[component] ??
            row.original.previousComponents[component];
          return (
            <span className="tabular-nums">
              {val !== null && val !== undefined
                ? formatCurrency(val)
                : "\u2014"}
            </span>
          );
        }
        const mode = componentModes[component] ?? "side_by_side";
        switch (mode) {
          case "current":
            return <CurrentOnlyCell delta={delta} />;
          case "previous":
            return <PreviousOnlyCell delta={delta} />;
          case "delta_only":
            return <DeltaOnlyCell delta={delta} />;
          default:
            return <DeltaCell delta={delta} />;
        }
      },
      sortingFn: (a, b) => {
        const aDelta = getComponentDelta(a.original, component)?.absoluteDiff ?? 0;
        const bDelta = getComponentDelta(b.original, component)?.absoluteDiff ?? 0;
        return aDelta - bDelta;
      },
    })),
  ], [visibleComponents, componentModes]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  });

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
        <div className="rounded-full bg-muted p-4">
          <ChevronsUpDown className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">No comparison data</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Select periods and run a comparison to see results here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : (
                    <button
                      className="flex items-center gap-1 select-none"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {{
                        asc: <ArrowUp className="h-3.5 w-3.5" />,
                        desc: <ArrowDown className="h-3.5 w-3.5" />,
                      }[header.column.getIsSorted() as string] ?? (
                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                    </button>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="group cursor-pointer"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                row.toggleExpanded();
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-12 text-center text-muted-foreground"
              >
                No matching employees found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="border-t">
        {table.getRowModel().rows.map(
          (row) =>
            row.getIsExpanded() && (
              <div
                key={`expanded-${row.id}`}
                className="border-b bg-muted/20 last:border-0"
              >
                <EmployeeDetailRow data={row.original} />
              </div>
            ),
        )}
      </div>
    </div>
  );
}
