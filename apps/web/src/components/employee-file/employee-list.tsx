"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, Copy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useEmployeeColumns } from "@/hooks/use-employee-columns";
import { formatCount, formatMoney } from "@/components/annual/annual-utils";
import { EmployeeColumnPicker } from "@/components/employee-file/employee-column-picker";
import { EmployeeListFilters } from "@/components/employee-file/employee-list-filters";
import { EmployeeListFooter } from "@/components/employee-file/employee-list-footer";
import { COMPANY_WIDE_NOTICE } from "@/components/employee-file/employee-file-text";
import { employeeFileHref } from "@/components/employee-file/employee-id-url";
import {
  compareByColumn,
  dimensionColumns,
  EMPLOYEE_COLUMNS,
  isWholeSetOnPage,
  listStatus,
  visibleColumnKeys,
  type EmployeeColumnKey,
  type EmployeeListRow,
} from "@/components/employee-file/employee-columns";
import {
  parseCadence,
  parseCurrency,
  parseFlag,
  parseList,
  parsePositiveInt,
  parseRange,
  parseScope,
  parseSort,
  parseYear,
  scopeSearch,
  type ListSort,
} from "@/components/employee-file/employee-list-url";

/**
 * The employee list (steps E2-E4).
 *
 * **The parent owns the URL.** Range, year, scope, sort and page live in the
 * query string so a view can be linked and reopened exactly as it was, and
 * every child takes an `onChange` and never calls `router.replace` itself —
 * two components navigating at once means the hardcoded one clobbers the one
 * that preserved the rest of the query string, which is the bug
 * `year-selector.tsx` carries a comment about.
 *
 * Free text is the exception: it stays in component state and is debounced
 * here. It is the one control where every keystroke would otherwise be a
 * history entry and a company-wide `ILIKE`.
 *
 * The server resolves its own defaults for year, cadence and currency — the
 * params stay absent until the user picks something, so the list does not fetch
 * twice on load the way the annual dashboard used to.
 */
export function EmployeeList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [text, setText] = useState("");
  const query = useDebounce(text, 300).trim();

  const year = parseYear(searchParams.get("year"));
  const range = parseRange(searchParams.get("range")) ?? "ytd";
  const slotIndex = parsePositiveInt(searchParams.get("slot"));
  const cadence = parseCadence(searchParams.get("cadence"));
  const currency = parseCurrency(searchParams.get("currency"));
  const scope = parseScope(searchParams.get("scope")) ?? "paid_in_range";
  const sort = parseSort(searchParams.get("sort")) ?? "flags";
  const page = parsePositiveInt(searchParams.get("page")) ?? 1;
  const departments = parseList(searchParams.get("departments"));
  const hasFlag = parseFlag(searchParams.get("flag"));

  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const listQuery = trpc.employeeFile.list.useQuery(
    {
      year,
      range,
      slotIndex,
      periodType: cadence,
      currency,
      scope,
      q: query.length > 0 ? query : undefined,
      departments,
      hasFlag,
      sort,
      page,
      pageSize: 50,
    },
    {
      retry: 1,
      // Keep the current page on screen while the next one loads, rather than
      // collapsing the table to skeletons on every filter change.
      placeholderData: keepPreviousData,
    },
  );

  const data = listQuery.data;
  // Memoised, so the empty-array fallback is not a new identity on every
  // render — three `useMemo`s below depend on it.
  const rows: EmployeeListRow[] = useMemo(() => data?.employees ?? [], [data?.employees]);
  const rangeLabel = data?.scope.label ?? "this range";

  const { keys: savedKeys, toggle, reset } = useEmployeeColumns();
  const visible = useMemo(() => visibleColumnKeys(rows, savedKeys), [rows, savedKeys]);
  const dimensionKeys = useMemo(
    () => (data?.dimensions ?? []).map((dimension) => dimension.key),
    [data?.dimensions],
  );
  const dimensionCols = useMemo(
    () => dimensionColumns(rows, dimensionKeys),
    [rows, dimensionKeys],
  );

  /**
   * Client-side sort, for the columns the server cannot order.
   *
   * The five columns with a server `sort` go to the server, so the order is the
   * order of the whole filtered set. The rest sort the rows on screen, and the
   * header says "this page" when that is not the same thing.
   */
  const [clientSort, setClientSort] = useState<{
    key: EmployeeColumnKey | `dim:${string}`;
    desc: boolean;
  } | null>(null);

  const total = data?.total ?? 0;
  const wholeSet = isWholeSetOnPage(total, rows.length);

  const sorted = useMemo(() => {
    if (!clientSort) return rows;
    const comparator = compareByColumn(clientSort.key);
    const copy = [...rows];
    copy.sort((a, b) => (clientSort.desc ? -comparator(a, b) : comparator(a, b)));
    return copy;
  }, [rows, clientSort]);

  const onHeaderClick = useCallback(
    (key: EmployeeColumnKey | `dim:${string}`, serverSort: ListSort | undefined) => {
      if (serverSort) {
        setClientSort(null);
        // Page 1: the row that was at the top of page 3 is not at the top of
        // the re-sorted set, so staying on page 3 shows an arbitrary slice.
        setParams({ sort: serverSort, page: null });
        return;
      }
      setClientSort((current) =>
        current && current.key === key ? { key, desc: !current.desc } : { key, desc: false },
      );
    },
    [setParams],
  );

  const columnDefs = EMPLOYEE_COLUMNS.filter((column) => visible.includes(column.key));
  const fileSearch = scopeSearch(new URLSearchParams(searchParams.toString()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Employee File</h2>
          {/* One sentence, because "manager" implies a scoping that does not
              exist in this product. Cheaper than a support ticket. */}
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{COMPANY_WIDE_NOTICE}</p>
        </div>
        <div className="flex items-center gap-2">
          <EmployeeColumnPicker
            rows={rows}
            visible={visible}
            onToggle={toggle}
            onReset={reset}
          />
        </div>
      </div>

      {data?.scope.defaultedToLatestData && data.scope.latestDataLabel && (
        <p className="text-sm text-muted-foreground">
          Showing {data.scope.label}, the latest year with data (to{" "}
          {data.scope.latestDataLabel}) rather than the year containing today.
        </p>
      )}

      <EmployeeListFilters
        scope={scope}
        onScopeChange={(next) => setParams({ scope: next, page: null })}
        range={range}
        onRangeChange={(next) => setParams({ range: next, page: null })}
        query={text}
        onQueryChange={setText}
        departments={data?.departments ?? []}
        selectedDepartments={departments ?? []}
        onDepartmentsChange={(next) =>
          setParams({ departments: next.length > 0 ? next.join(",") : null, page: null })
        }
        dimensions={data?.dimensions ?? []}
        hasFlag={hasFlag}
        onHasFlagChange={(next) => setParams({ flag: next ?? null, page: null })}
        scopeOptions={data?.scope.scopeOptions ?? []}
        periodType={data?.scope.periodType ?? "monthly"}
        currency={data?.scope.currency ?? "USD"}
        onScopeOptionChange={(option) =>
          setParams({
            cadence: option.periodType,
            currency: option.currency,
            page: null,
          })
        }
      />

      <Card>
        <CardContent className="p-0">
          {listQuery.isPending ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : listQuery.isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              Could not list this range&apos;s employees. Reloading usually works.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columnDefs.map((column) => {
                      const active = sort === column.sort && !clientSort;
                      const clientActive = clientSort?.key === column.key;
                      return (
                        <TableHead
                          key={column.key}
                          className={cn(column.align === "right" && "text-right")}
                        >
                          <button
                            type="button"
                            onClick={() => onHeaderClick(column.key, column.sort)}
                            title={column.note}
                            className="inline-flex items-center gap-1 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {column.label}
                            {active && <ArrowDown className="h-3 w-3" aria-hidden="true" />}
                            {clientActive &&
                              (clientSort.desc ? (
                                <ArrowUp className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <ArrowDown className="h-3 w-3" aria-hidden="true" />
                              ))}
                          </button>
                          {clientActive && !wholeSet && (
                            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                              this page
                            </span>
                          )}
                        </TableHead>
                      );
                    })}
                    {dimensionCols.map((dimension) => (
                      <TableHead key={dimension.key}>{dimension.key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={columnDefs.length + dimensionCols.length}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Nobody matches this scope and these filters.
                      </TableCell>
                    </TableRow>
                  )}
                  {sorted.map((row) => {
                    const status = listStatus(row);
                    const currencyCode = data?.scope.currency ?? "USD";
                    return (
                      <TableRow key={row.externalId}>
                        {columnDefs.map((column) => (
                          <TableCell
                            key={column.key}
                            className={cn(
                              column.align === "right" && "text-right tabular-nums",
                            )}
                          >
                            {column.key === "employee" && (
                              <Link
                                href={employeeFileHref(row.externalId, fileSearch)}
                                className="block hover:underline"
                              >
                                <span className="font-medium">
                                  {row.name ?? row.externalId}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {row.externalId}
                                </span>
                              </Link>
                            )}
                            {column.key === "status" && (
                              <Badge
                                variant={status.kind === "active" ? "secondary" : "outline"}
                                className="font-normal"
                              >
                                {status.label}
                              </Badge>
                            )}
                            {column.key === "flags" && (
                              <span className="inline-flex items-center justify-end gap-2">
                                {row.criticalFlags > 0 && (
                                  <span
                                    className="inline-flex items-center gap-1 text-destructive"
                                    title={`${row.netExceedsGrossRows} rows with net above gross, ${row.negativeNetRows} with negative net`}
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                    {row.criticalFlags}
                                  </span>
                                )}
                                {row.hasDuplicateRows && (
                                  <span
                                    className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500"
                                    title="More than one row for this employee in some period in range"
                                  >
                                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                  </span>
                                )}
                                {row.criticalFlags === 0 && !row.hasDuplicateRows && (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </span>
                            )}
                            {column.key === "department" && row.department}
                            {column.key === "lastPaidSlot" &&
                              (row.lastPaidSlotLabel ?? (
                                <span
                                  className="text-muted-foreground"
                                  title="Nothing paid to this employee in the selected range"
                                >
                                  Not paid in range
                                </span>
                              ))}
                            {column.key === "latestGross" &&
                              (row.paidInRange ? (
                                formatMoney(row.latestGross, currencyCode)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              ))}
                            {column.key === "latestNet" &&
                              (row.paidInRange ? (
                                formatMoney(row.latestNet, currencyCode)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              ))}
                            {column.key === "paidPeriods" && (
                              <span title="Paid slots of covered slots in range">
                                {formatCount(row.paidPeriods)} / {formatCount(row.coveredSlots)}
                              </span>
                            )}
                            {column.key === "rangeGross" &&
                              (row.paidInRange ? (
                                formatMoney(row.rangeGross, currencyCode)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              ))}
                            {column.key === "fte" &&
                              (row.fte === null || row.fte === undefined ? "—" : row.fte)}
                          </TableCell>
                        ))}
                        {dimensionCols.map((dimension) => (
                          <TableCell key={dimension.key}>
                            {row.dimensions?.[dimension.key] ?? "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeListFooter
        shown={rows.length}
        total={total}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? 50}
        scope={scope}
        rangeLabel={rangeLabel}
        excludedByScope={data?.excludedByScope ?? 0}
        coveredSlots={data?.scope.coveredSlotIndexes.length ?? 0}
        supersededCount={data?.scope.supersededCount ?? 0}
        departmentFiltered={(departments?.length ?? 0) > 0}
        onPageChange={(next) => setParams({ page: next <= 1 ? null : String(next) })}
      />
    </div>
  );
}
