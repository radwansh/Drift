"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge, Notice, PageHeader, Panel, PanelBar, PanelFoot } from "@/components/cv";
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
import { formatCount, formatMoney, formatRatio } from "@/components/annual/annual-utils";
import { EmployeeColumnPicker } from "@/components/employee-file/employee-column-picker";
import {
  EmployeeListFilters,
  EmployeeListTableFilters,
} from "@/components/employee-file/employee-list-filters";
import {
  EmployeeListFooter,
  EmployeeListNotes,
} from "@/components/employee-file/employee-list-footer";
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
  type ListScope,
  type ListSort,
} from "@/components/employee-file/employee-list-url";

/**
 * The employee list (steps E2-E4), on Ink & Signal (canvas board "Employee
 * File: list").
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
 *
 * The rebuild is presentation only: `PageHeader`, a toolbar for what chooses
 * the set, the table in a `Panel flush` with its filters in the `PanelBar` and
 * its pagination in the `PanelFoot`. Every query, handler, figure and formatter
 * is the one that was here before.
 */

/**
 * The title names the set on screen, because the three scopes are three
 * different sets and only one of them is "paid in" the range. "Employees paid
 * in 2026" over a list of everyone on record would be the same class of
 * mislabel as a page-sorted column presented as the order of the whole set.
 */
function listTitle(scope: ListScope, rangeLabel: string): string {
  switch (scope) {
    case "currently_employed":
      return "Employees currently employed";
    case "everyone_on_record":
      return "Everyone on record";
    default:
      return `Employees paid in ${rangeLabel}`;
  }
}

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
  const dimensionCols = useMemo(() => dimensionColumns(rows, dimensionKeys), [rows, dimensionKeys]);

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
  const currencyCode = data?.scope.currency ?? "USD";

  /**
   * What the foot says the table is ordered by. A client-side sort of one page
   * out of many says so, in the same words the header uses.
   */
  const sortLabel = useMemo(() => {
    if (clientSort) {
      const label = clientSort.key.startsWith("dim:")
        ? clientSort.key.slice("dim:".length)
        : (EMPLOYEE_COLUMNS.find((column) => column.key === clientSort.key)?.label ?? null);
      if (!label) return null;
      return wholeSet ? label : `${label}, this page only`;
    }
    return EMPLOYEE_COLUMNS.find((column) => column.sort === sort)?.label ?? null;
  }, [clientSort, sort, wholeSet]);

  /**
   * The count line above the table. The flagged count can only be taken from
   * the rows on screen — `employeeFile.list` returns one count per scope, not a
   * count of flagged people — so it says "on this page" unless the page is the
   * whole set. Filtering to "Critical only" is the way to the true number.
   */
  const flaggedOnPage = sorted.filter((row) => row.criticalFlags > 0).length;
  const countLine = data
    ? `${formatCount(total)} ${total === 1 ? "person" : "people"} · ${formatCount(flaggedOnPage)}${
        wholeSet ? "" : " on this page"
      } with a critical flag`
    : "Listing employees…";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Employee File"
        title={listTitle(scope, rangeLabel)}
        /* One sentence, because "manager" implies a scoping that does not
           exist in this product. Cheaper than a support ticket. */
        lede={COMPANY_WIDE_NOTICE}
        actions={
          <EmployeeColumnPicker rows={rows} visible={visible} onToggle={toggle} onReset={reset} />
        }
      />

      {data?.scope.defaultedToLatestData && data.scope.latestDataLabel && (
        <Notice tone="info">
          Showing {data.scope.label}, the latest year with data (to {data.scope.latestDataLabel})
          rather than the year containing today.
        </Notice>
      )}

      <EmployeeListFilters
        scope={scope}
        onScopeChange={(next) => setParams({ scope: next, page: null })}
        range={range}
        onRangeChange={(next) => setParams({ range: next, page: null })}
        slots={data?.scope.allSlots ?? []}
        slotIndex={data?.scope.slotIndex ?? null}
        onSlotChange={(next) => setParams({ slot: String(next), page: null })}
        query={text}
        onQueryChange={setText}
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

      <Panel flush>
        <PanelBar className="justify-between">
          <p className="m-0 text-[13px] leading-[18px] text-cv-ink-muted">{countLine}</p>
          <div className="flex flex-wrap items-center gap-2">
            <EmployeeListTableFilters
              departments={data?.departments ?? []}
              selectedDepartments={departments ?? []}
              onDepartmentsChange={(next) =>
                setParams({ departments: next.length > 0 ? next.join(",") : null, page: null })
              }
              dimensions={data?.dimensions ?? []}
              hasFlag={hasFlag}
              onHasFlagChange={(next) => setParams({ flag: next ?? null, page: null })}
              /* One call, so the two filters are written from one snapshot of
                 the query string rather than two that race. */
              onClearFilters={() => setParams({ departments: null, flag: null, page: null })}
            />
          </div>
        </PanelBar>

        {listQuery.isPending ? (
          <div className="flex flex-col gap-2 p-4" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : listQuery.isError ? (
          <div className="p-4">
            <Notice tone="danger">
              Could not list this range&apos;s employees. Reloading usually works.
            </Notice>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {columnDefs.map((column) => {
                    const active = sort === column.sort && !clientSort;
                    const clientActive = clientSort?.key === column.key;
                    /**
                     * The sort direction, for a screen reader.
                     *
                     * The arrows are `aria-hidden`, so without `aria-sort`
                     * the only indication of which column the table is
                     * ordered by, and which way, was a glyph announced to
                     * nobody. Name sorts ascending; every other server sort
                     * is "biggest first".
                     */
                    const ariaSort = clientActive
                      ? clientSort.desc
                        ? ("descending" as const)
                        : ("ascending" as const)
                      : active
                        ? column.sort === "name"
                          ? ("ascending" as const)
                          : ("descending" as const)
                        : ("none" as const);
                    return (
                      <TableHead
                        key={column.key}
                        aria-sort={ariaSort}
                        className={cn(column.align === "right" && "text-right")}
                      >
                        <button
                          type="button"
                          onClick={() => onHeaderClick(column.key, column.sort)}
                          title={column.note}
                          className="inline-flex items-center gap-1 font-medium text-cv-ink-muted transition-colors duration-[120ms] hover:text-cv-ink focus-visible:shadow-cv-focus-ring focus-visible:outline-none"
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
                          <span className="ml-1 text-xs font-normal text-cv-ink-subtle">
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
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={columnDefs.length + dimensionCols.length}
                      className="py-10 text-center text-sm leading-5 text-cv-ink-subtle"
                    >
                      Nobody matches this scope and these filters.
                    </TableCell>
                  </TableRow>
                )}
                {sorted.map((row) => {
                  const status = listStatus(row);
                  return (
                    <TableRow key={row.externalId}>
                      {columnDefs.map((column) => (
                        <TableCell
                          key={column.key}
                          className={cn(
                            column.align === "right" && "text-right",
                            // Figures in Geist Mono, tabular and right-aligned;
                            // the identity and status columns are words.
                            column.align === "right" && column.key !== "flags" && "cv-num",
                          )}
                        >
                          {column.key === "employee" && (
                            <Link
                              href={employeeFileHref(row.externalId, fileSearch)}
                              className="-mx-1 block rounded-cv-sm px-1 py-0.5 no-underline hover:underline focus-visible:shadow-cv-focus-ring focus-visible:outline-none"
                            >
                              <span className="block text-sm font-semibold leading-5 text-cv-ink">
                                {row.name ?? row.externalId}
                              </span>
                              <span className="block font-cv-mono text-xs leading-4 text-cv-ink-subtle">
                                {row.externalId}
                              </span>
                            </Link>
                          )}
                          {column.key === "status" && <Badge tone="neutral">{status.label}</Badge>}
                          {column.key === "flags" && (
                            <span className="inline-flex items-center justify-end gap-1.5">
                              {row.criticalFlags > 0 && (
                                <Badge
                                  tone="danger"
                                  icon="alert"
                                  title={`${row.netExceedsGrossRows} rows with net above gross, ${row.negativeNetRows} with negative net`}
                                >
                                  {formatCount(row.criticalFlags)}
                                </Badge>
                              )}
                              {row.hasDuplicateRows && (
                                <Badge
                                  tone="warning"
                                  icon="alert"
                                  title="More than one row for this employee in some period in range"
                                >
                                  Duplicate rows
                                </Badge>
                              )}
                              {row.criticalFlags === 0 && !row.hasDuplicateRows && (
                                <span className="cv-num text-cv-ink-subtle">0</span>
                              )}
                            </span>
                          )}
                          {column.key === "department" && row.department}
                          {column.key === "lastPaidSlot" &&
                            (row.lastPaidSlotLabel ?? (
                              <span
                                className="text-cv-ink-subtle"
                                title="Nothing paid to this employee in the selected range"
                              >
                                Not paid in range
                              </span>
                            ))}
                          {column.key === "latestGross" &&
                            (row.paidInRange ? (
                              formatMoney(row.latestGross, currencyCode)
                            ) : (
                              <span className="text-cv-ink-subtle">—</span>
                            ))}
                          {column.key === "latestNet" &&
                            (row.paidInRange ? (
                              formatMoney(row.latestNet, currencyCode)
                            ) : (
                              <span className="text-cv-ink-subtle">—</span>
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
                              <span className="text-cv-ink-subtle">—</span>
                            ))}
                          {column.key === "fte" &&
                            (row.fte === null || row.fte === undefined ? (
                              <span
                                className="text-cv-ink-subtle"
                                title="No register in range carries an FTE for this employee"
                              >
                                —
                              </span>
                            ) : (
                              formatRatio(row.fte)
                            ))}
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

        {/* No foot until there is a set to describe: "Nobody matches this
            scope and these filters" under a page of skeletons is a count of a
            set that has not been counted yet. */}
        {data && (
          <PanelFoot>
            <EmployeeListFooter
              shown={rows.length}
              total={total}
              page={data.page}
              pageSize={data.pageSize}
              sortLabel={sortLabel}
              onPageChange={(next) => setParams({ page: next <= 1 ? null : String(next) })}
            />
          </PanelFoot>
        )}
      </Panel>

      <EmployeeListNotes
        scope={scope}
        rangeLabel={rangeLabel}
        excludedByScope={data?.excludedByScope ?? 0}
        currentlyEmployedKnown={data?.currentlyEmployedKnown ?? true}
        coveredSlots={data?.scope.coveredSlotIndexes.length ?? 0}
        supersededCount={data?.scope.supersededCount ?? 0}
        departmentFiltered={(departments?.length ?? 0) > 0}
      />
    </div>
  );
}
