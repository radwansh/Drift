"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { ArrowLeft, UserX } from "lucide-react";
import type { PeriodType } from "@saas/payroll-core";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";
import { buildPeriodRows } from "@/components/employee-file/employee-chart-data";
import { EmployeeFileHeader } from "@/components/employee-file/employee-file-header";
import { EmployeePeriodTable } from "@/components/employee-file/employee-period-table";
import {
  parseCadence,
  parseCurrency,
  parsePositiveInt,
  parseRange,
  parseYear,
  RANGE_KINDS,
  RANGE_LABELS,
  type RangeKind,
} from "@/components/employee-file/employee-list-url";

/**
 * One employee's file (steps E5 and E6).
 *
 * The parent owns the URL here too, for the same reason as the list: a file
 * opened at a range should reopen at that range from a bookmark, and two
 * components navigating at once means one clobbers the other's params.
 *
 * `employeeFile.get` returns the whole assembled file in one request. There is
 * **no memo** on it, so every view is a cold three requests — deliberate, since
 * the list and the file are different pages with different inputs and a memo
 * here would add a cache-invalidation surface and save nothing.
 */
export function EmployeeFileView({ externalId }: { externalId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const year = parseYear(searchParams.get("year"));
  const range = parseRange(searchParams.get("range")) ?? "ytd";
  const slotIndex = parsePositiveInt(searchParams.get("slot"));
  const cadence = parseCadence(searchParams.get("cadence"));
  const currency = parseCurrency(searchParams.get("currency"));

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

  const fileQuery = trpc.employeeFile.get.useQuery(
    { externalId, year, range, slotIndex, periodType: cadence, currency },
    { retry: 1, placeholderData: keepPreviousData },
  );

  const data = fileQuery.data;
  const file = data?.file;
  const rows = useMemo(
    () => (file ? buildPeriodRows(file.slots, file.cadence) : []),
    [file],
  );

  const notFound = fileQuery.error?.data?.code === "NOT_FOUND";

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="rounded-full bg-muted p-4">
          <UserX className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="mt-6 text-2xl font-bold">Not on this register</h2>
        <p className="mt-2 max-w-md text-center text-muted-foreground">
          No ready period for this company has a row for <code>{externalId}</code>. An id that
          exists but has nothing in the selected range opens as an empty file instead, so this
          means the id itself is unknown here.
        </p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/employees">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to the list
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/employees">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            All employees
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(value) => setParams({ range: value as RangeKind })}>
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

          {range === "slot" && data && data.scope.expected.length > 0 && (
            <Select
              value={String(slotIndex ?? data.scope.expected[0]?.index ?? 1)}
              onValueChange={(value) => setParams({ slot: value })}
            >
              <SelectTrigger aria-label="Period" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.scope.expected.map((slot) => (
                  <SelectItem key={slot.index} value={String(slot.index)}>
                    {slot.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {data && data.scope.scopeOptions.length > 1 && (
            <Select
              value={`${data.scope.periodType}|${data.scope.currency}`}
              onValueChange={(value) => {
                const [nextType, nextCurrency] = value.split("|");
                if (nextType && nextCurrency) {
                  setParams({ cadence: nextType, currency: nextCurrency });
                }
              }}
            >
              <SelectTrigger aria-label="Cadence and currency" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.scope.scopeOptions.map((option) => (
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
        </div>
      </div>

      {fileQuery.isPending || !file || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <EmployeeFileHeader
            file={file}
            scopeLabel={data.scope.label}
            onScopeChange={(option) =>
              setParams({
                cadence: (option.periodType as PeriodType | undefined) ?? null,
                currency: option.currency ?? null,
              })
            }
          />

          {/* An id with nothing in this range is a valid, empty file — not a
              404 — so every bookmark does not break each January. */}
          {file.kpis.coverage.paid === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Nothing was paid to this employee in {data.scope.label}. They are on this
                company&apos;s register, so try another year or a wider range.
              </CardContent>
            </Card>
          )}

          <EmployeePeriodTable rows={rows} flags={file.flags} currency={file.currency} />
        </>
      )}
    </div>
  );
}
