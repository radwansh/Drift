"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  classifyComponentWithReason,
  type Category,
  type EmployeeFileResult,
} from "@saas/payroll-core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatComponentName, formatMoney } from "@/components/annual/annual-utils";
import {
  SLOT_KIND_LABELS,
  slotKindReason,
} from "@/components/employee-file/employee-file-text";
import type { PeriodRow } from "@/components/employee-file/employee-chart-data";

/**
 * The component history matrix (step E5, spec 4.5).
 *
 * Rows are component keys **as the register names them**, grouped by category,
 * with uncategorised keys last under "Not categorised". Columns are the slots
 * in R. This is the cheapest thing in the feature to build and the artefact a
 * payroll admin actually asks for: *when did the housing allowance start, and
 * what was it before July.*
 *
 * The one rule that matters: **blank for absent, `0.00` only when the register
 * really says zero** (spec 7.14). `processUpload` writes a present cell as a
 * number and an absent one as `null`, so coalescing would read a blank cell as
 * a removed component — and make "received overtime" true for everyone.
 */

interface MatrixRow {
  key: string;
  category: Category;
  /** One cell per slot: a number, or null for a cell the register omits. */
  values: (number | null)[];
}

const CATEGORY_ORDER: readonly Category[] = [...ALL_CATEGORIES];

function categoryRank(category: Category): number {
  // Uncategorised last, with the rest in the engine's own order so the matrix
  // and the bridge group the same columns the same way.
  if (category === "uncategorised") return CATEGORY_ORDER.length + 1;
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

export function EmployeeComponentMatrix({
  file,
  rows,
}: {
  file: EmployeeFileResult;
  rows: readonly PeriodRow[];
}) {
  const matrix = useMemo<MatrixRow[]>(() => {
    const keys = new Map<string, Category>();
    for (const row of rows) {
      for (const [key, entry] of Object.entries(row.slot.byKey)) {
        keys.set(key, entry.category);
      }
    }

    return [...keys.entries()]
      .map(([key, category]) => ({
        key,
        category,
        values: rows.map((row) => row.slot.byKey[key]?.total ?? null),
      }))
      .sort(
        (a, b) =>
          categoryRank(a.category) - categoryRank(b.category) || a.key.localeCompare(b.key),
      );
  }, [rows]);

  if (matrix.length === 0) return null;

  const uncategorised = matrix.filter((row) => row.category === "uncategorised");
  let lastCategory: Category | null = null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Component history</CardTitle>
        <CardDescription>
          Every component this employee was paid in range, under the name the register uses. In
          a period that was uploaded and paid, a blank cell means the column was not on that
          period&apos;s register and 0.00 means it was, with a value of zero. A period with no
          register to read — nobody uploaded it, or this employee is not in it — is marked in
          the header and dashed all the way down.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[14rem]">Component</TableHead>
                {/*
                  The slot's `kind` is marked in the header, because a blank
                  cell in a `missing` column is not the fact the caption
                  describes: nobody uploaded that period, so there was no
                  register for the column to be absent from. The four-valued
                  `kind` exists to keep "we do not know" apart from "they got
                  nothing", and the matrix was collapsing both into the one
                  blank that the caption calls "the column was not there".
                */}
                {rows.map((row) => (
                  <TableHead key={row.index} className="whitespace-nowrap text-right">
                    {row.label}
                    {row.kind !== "actual" && (
                      <span
                        className="block text-[10px] font-normal lowercase text-muted-foreground"
                        title={slotKindReason(row.kind, row.rowCount) ?? undefined}
                      >
                        {SLOT_KIND_LABELS[row.kind]}
                      </span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.map((entry) => {
                const header = entry.category !== lastCategory ? entry.category : null;
                lastCategory = entry.category;
                // `classifyComponentWithReason(key).rule` on hover, as the
                // category manager already does — so "why is this an
                // allowance" is answerable without leaving the file.
                const rule = classifyComponentWithReason(entry.key).rule;

                return (
                  <Fragment key={entry.key}>
                    {header && (
                      <TableRow className="bg-muted/50">
                        <TableCell
                          colSpan={rows.length + 1}
                          className="py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {header === "uncategorised"
                            ? "Not categorised"
                            : CATEGORY_LABELS[header]}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell
                        className="font-medium"
                        title={`Classified by rule: ${rule}`}
                      >
                        {formatComponentName(entry.key)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {entry.key}
                        </span>
                      </TableCell>
                      {entry.values.map((value, index) => {
                        const slot = rows[index];
                        // A period with no register for this employee gets a
                        // dash with its reason, never the blank that means "the
                        // column was not on the register".
                        const noRegister =
                          slot !== undefined &&
                          (slot.kind === "missing" || slot.kind === "not_paid");
                        return (
                          <TableCell
                            key={slot?.index ?? index}
                            className="text-right tabular-nums"
                            title={
                              noRegister && slot
                                ? slotKindReason(slot.kind, slot.rowCount) ?? undefined
                                : undefined
                            }
                          >
                            {noRegister ? (
                              <span className="text-muted-foreground">—</span>
                            ) : value === null ? (
                              ""
                            ) : (
                              formatMoney(value, file.currency)
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {uncategorised.length > 0 && (
          <div className="border-t p-4 text-sm text-muted-foreground">
            {uncategorised.length} {uncategorised.length === 1 ? "column" : "columns"} could not
            be placed by the classifier, so{" "}
            {uncategorised.length === 1 ? "its value" : "their values"} sit in the unmapped
            balance rather than in a category.{" "}
            <Link href="/annual-salaries" className="font-medium text-foreground underline">
              Categorise them on the annual dashboard
            </Link>{" "}
            and this file follows, because both read the same saved categories.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
