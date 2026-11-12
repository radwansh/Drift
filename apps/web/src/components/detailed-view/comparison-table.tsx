"use client";

import { Fragment, useMemo, useState } from "react";
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
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Badge, EmptyState, Icon, Panel, PanelBar, Variance } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn, formatComponentName, formatCurrency } from "@/lib/utils";
import { EmployeeDetailRow } from "./employee-detail-row";
import type { ColumnConfig, ColumnMode } from "./column-picker";

/**
 * The comparison table (canvas board "Detailed View") — every employee, every
 * pay component, two periods side by side.
 *
 * The rebuild is presentation only: the same TanStack table, the same column
 * ids, the same sorting functions and the same `getComponentDelta` arithmetic.
 * What changed is how a change is drawn.
 *
 * - **Every signed figure is a `<Variance>`.** It carries the direction three
 *   ways — an arrow, a sign and colour — and speaks "Increase"/"Decrease" to a
 *   screen reader before the amount. The old cells coloured a bare number
 *   green or red, which is the one thing this product must not do: green and
 *   red read as good and bad, and a payroll change is neither. Rust is up,
 *   cobalt is down, grey is no change.
 * - **Money never formats itself.** `format={(n) => formatCurrency(n, currency)}`
 *   goes through the app's one formatter, so every figure is `USD 1,234.56`.
 * - **Status is a word.** Increased and Decreased carry the net movement as a
 *   percentage beside the word; Unchanged, New and Departed are neutral
 *   badges. A status was a coloured badge before — `success` for an increase
 *   and `warning` for a decrease — which told the reader a rise is good news.
 * - **`flagged` means the customer's own threshold**, not a redesign of one:
 *   the net cell takes the signal tint when the engine already raised
 *   `net_change_beyond_tolerance` for that employee, which is
 *   `anomaly-detector.ts` applying the company's `netChangePct`. Nothing here
 *   computes a threshold of its own.
 *
 * The expanded detail now renders in the table, directly under its own row.
 * It used to be appended after the whole `<table>`, so expanding the third row
 * put its components at the bottom of the page and expanding two rows stacked
 * both there, far from the rows that opened them.
 */

interface ComparisonTableProps {
  data: ComparisonOutput[];
  columnConfig: ColumnConfig[];
  loading: boolean;
  /**
   * The company currency (step 8b). It is in the `columns` memo's dependency
   * list because the cell renderers close over it: without that, changing
   * company would leave every figure labelled in the previous one's code.
   */
  currency: string;
}

/**
 * The classifier's five statuses as words.
 *
 * Exported because the toolbar's status filter reads the same map: a filter
 * and a column that each kept their own copy of these words would eventually
 * disagree about what a row is. Key order is the order the filter offers them
 * in, which is why it is movement first and population after.
 */
export const STATUS_LABELS: Record<ComparisonOutput["status"], string> = {
  increased: "Increased",
  decreased: "Decreased",
  unchanged: "Unchanged",
  new: "New",
  departed: "Departed",
};

/**
 * The engine's "this employee's net moved past the company's tolerance" flag
 * (`packages/payroll-core/src/anomaly-detector.ts`). It is the product's only
 * statement of a customer threshold on this screen, so it is the only thing
 * that earns `<Variance flagged>`.
 */
const NET_TOLERANCE_FLAG = "net_change_beyond_tolerance";

function overCustomerThreshold(row: ComparisonOutput, component: string): boolean {
  if (component !== "net_salary") return false;
  return (row.anomalyFlags ?? []).some((flag) => flag.type === NET_TOLERANCE_FLAG);
}

const DASH = "—";

function SideBySideCell({
  delta,
  currency,
  flagged,
}: {
  delta: ComponentDelta;
  currency: string;
  flagged: boolean;
}) {
  const money = (value: number) => formatCurrency(value, currency);
  return (
    <div className="flex items-center justify-end gap-3">
      <span className="cv-num w-24 text-cv-ink-subtle">
        {delta.previousValue !== null ? money(delta.previousValue) : DASH}
      </span>
      <Icon name="arrow-right" size={12} className="flex-none text-cv-ink-subtle" />
      <span className="cv-num w-24">
        {delta.currentValue !== null ? money(delta.currentValue) : DASH}
      </span>
      <span className="flex w-28 justify-end">
        {delta.absoluteDiff !== null ? (
          <Variance value={delta.absoluteDiff} format={money} flagged={flagged} />
        ) : (
          <span className="cv-num text-cv-ink-subtle">{DASH}</span>
        )}
      </span>
    </div>
  );
}

function SinglePeriodCell({ value, currency }: { value: number | null; currency: string }) {
  return (
    <span className={cn(value === null ? "text-cv-ink-subtle" : "cv-num")}>
      {value !== null ? formatCurrency(value, currency) : DASH}
    </span>
  );
}

function ChangeOnlyCell({
  delta,
  currency,
  flagged,
}: {
  delta: ComponentDelta;
  currency: string;
  flagged: boolean;
}) {
  if (delta.absoluteDiff === null) {
    return <span className="cv-num text-cv-ink-subtle">{DASH}</span>;
  }
  return (
    <Variance
      value={delta.absoluteDiff}
      percent={delta.percentageDiff}
      format={(n) => formatCurrency(n, currency)}
      flagged={flagged}
      className="justify-end"
    />
  );
}

/** The word, with the net movement beside it when the word is a direction. */
function StatusCell({ row }: { row: ComparisonOutput }) {
  const label = STATUS_LABELS[row.status] ?? row.status;
  if (row.status !== "increased" && row.status !== "decreased") {
    return <Badge tone="neutral">{label}</Badge>;
  }
  const net = getComponentDelta(row, "net_salary");
  const change = net?.absoluteDiff ?? null;
  const percent = net?.percentageDiff ?? null;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="text-sm font-medium leading-5 text-cv-ink">{label}</span>
      {change !== null && percent !== null && (
        <Variance value={change} percent={percent} percentOnly />
      )}
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
      percentageDiff:
        row.previousGross && row.currentGross
          ? ((row.currentGross - row.previousGross) / row.previousGross) * 100
          : null,
    };
  }
  if (component === "net_salary") {
    return {
      component: "net_salary",
      previousValue: row.previousNet ?? null,
      currentValue: row.currentNet ?? null,
      absoluteDiff: row.netDelta,
      percentageDiff:
        row.previousNet && row.currentNet
          ? ((row.currentNet - row.previousNet) / row.previousNet) * 100
          : null,
    };
  }
  return row.componentDeltas.find((d) => d.component === component);
}

export function ComparisonTable({ data, columnConfig, loading, currency }: ComparisonTableProps) {
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

  const columns = useMemo<ColumnDef<ComparisonOutput>[]>(
    () => [
      {
        id: "expander",
        header: () => null,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <button
              type="button"
              onClick={row.getToggleExpandedHandler()}
              aria-expanded={row.getIsExpanded()}
              aria-label={
                row.getIsExpanded()
                  ? `Hide ${row.original.employeeName}'s components`
                  : `Show ${row.original.employeeName}'s components`
              }
              className="inline-flex h-6 w-6 items-center justify-center rounded-cv-sm text-cv-ink-muted transition-colors duration-[120ms] hover:bg-cv-surface-sunken hover:text-cv-ink focus-visible:shadow-cv-focus-ring focus-visible:outline-none"
            >
              {row.getIsExpanded() ? (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
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
          <span className="font-cv-mono text-xs leading-4 text-cv-ink-subtle">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "employeeName",
        header: "Employee name",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-sm font-semibold leading-5 text-cv-ink">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "department",
        header: "Department",
        cell: ({ getValue }) => {
          const dept = getValue() as string | null;
          return dept ?? <span className="text-cv-ink-subtle">{DASH}</span>;
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusCell row={row.original} />,
      },
      ...visibleComponents.map(
        (component): ColumnDef<ComparisonOutput> => ({
          id: component,
          header: () => <span>{formatComponentName(component)}</span>,
          cell: ({ row }) => {
            const delta = getComponentDelta(row.original, component);
            if (!delta) {
              const val =
                row.original.currentComponents[component] ??
                row.original.previousComponents[component];
              return <SinglePeriodCell value={val ?? null} currency={currency} />;
            }
            const flagged = overCustomerThreshold(row.original, component);
            const mode = componentModes[component] ?? "side_by_side";
            switch (mode) {
              case "current":
                return <SinglePeriodCell value={delta.currentValue} currency={currency} />;
              case "previous":
                return <SinglePeriodCell value={delta.previousValue} currency={currency} />;
              case "delta_only":
                return <ChangeOnlyCell delta={delta} currency={currency} flagged={flagged} />;
              default:
                return <SideBySideCell delta={delta} currency={currency} flagged={flagged} />;
            }
          },
          sortingFn: (a, b) => {
            const aDelta = getComponentDelta(a.original, component)?.absoluteDiff ?? 0;
            const bDelta = getComponentDelta(b.original, component)?.absoluteDiff ?? 0;
            return aDelta - bDelta;
          },
        }),
      ),
    ],
    [visibleComponents, componentModes, currency],
  );

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
      <Panel flush>
        <div className="flex flex-col gap-2 p-4" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Panel>
    );
  }

  /**
   * The count line. This table only mounts once a comparison has run, so an
   * empty `data` is the search and the filters matching nobody — not "no
   * comparison data", which is what the old empty card said and which was
   * never the reason it appeared.
   */
  const flagged = data.filter((row) => (row.anomalyFlags?.length ?? 0) > 0).length;
  const countLine =
    data.length === 0
      ? "Nobody matches this search and these filters"
      : `${data.length} ${data.length === 1 ? "employee" : "employees"} · ${flagged} with an anomaly flag`;
  const rightAligned = new Set(visibleComponents);

  return (
    <Panel flush>
      <PanelBar>
        <p className="m-0 text-[13px] leading-[18px] text-cv-ink-muted">{countLine}</p>
      </PanelBar>

      {data.length === 0 ? (
        <EmptyState
          bare
          title="Nobody matches this search and these filters"
          description="Clear the search or widen the department filter to see the rest of the comparison."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        aria-sort={
                          sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"
                        }
                        className={cn(rightAligned.has(header.column.id) && "text-right")}
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={cn(
                              "inline-flex select-none items-center gap-1 font-medium text-cv-ink-muted transition-colors duration-[120ms] hover:text-cv-ink focus-visible:shadow-cv-focus-ring focus-visible:outline-none",
                            )}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronsUpDown
                                className="h-3.5 w-3.5 text-cv-ink-subtle"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className="group cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      row.toggleExpanded();
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(rightAligned.has(cell.column.id) && "text-right")}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {/* Under its own row, never at the foot of the table. */}
                  {row.getIsExpanded() && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={row.getVisibleCells().length}
                        className="h-auto bg-cv-surface-sunken p-0 align-top"
                      >
                        <EmployeeDetailRow data={row.original} currency={currency} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
