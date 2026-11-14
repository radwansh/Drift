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
import { Icon, Panel, PanelFoot } from "@/components/cv";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatComponentName, formatMoney } from "@/components/annual/annual-utils";
import { SLOT_KIND_LABELS, slotKindReason } from "@/components/employee-file/employee-file-text";
import type { PeriodRow } from "@/components/employee-file/employee-chart-data";

/**
 * The component history matrix (step E5, spec 4.5), on Ink & Signal (canvas
 * board "Employee File: one person").
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

/**
 * Whether this cell moved from the column to its left, at the currency's own
 * precision (board: "a change from the period before gets an arrow").
 *
 * Four conditions, each the same rule the rest of the file already applies.
 * Both slots must be `actual`: a `duplicate` slot is a sum of rows that may be
 * one payment or two, and it is excluded from every delta in `buildPeriodRows`
 * for exactly that reason. Both cells must be present: a blank cell means the
 * column was not on that register, which is not a move to zero. And the
 * comparison rounds to `decimals` first, so float noise under the currency's
 * smallest unit is not drawn as a change — the same floor the change log uses.
 */
function movement(
  current: number | null,
  previous: number | null,
  comparable: boolean,
  decimals: number,
): "up" | "down" | null {
  if (!comparable || current === null || previous === null) return null;
  const unit = 10 ** decimals;
  const a = Math.round(current * unit);
  const b = Math.round(previous * unit);
  if (a === b) return null;
  return a > b ? "up" : "down";
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
        (a, b) => categoryRank(a.category) - categoryRank(b.category) || a.key.localeCompare(b.key),
      );
  }, [rows]);

  if (matrix.length === 0) return null;

  const uncategorised = matrix.filter((row) => row.category === "uncategorised");
  let lastCategory: Category | null = null;

  return (
    <Panel
      flush
      headingId="employee-components-h"
      title="Component history"
      description="Every component this employee was paid in range, under the name the register uses. In a period that was uploaded and paid, a blank cell means the column was not on that period's register and 0.00 means it was, with a value of zero. A period with no register to read — nobody uploaded it, or this employee is not in it — is marked in the header and dashed all the way down."
    >
      <div className="overflow-x-auto border-t border-cv-line">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
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
                      className="block text-xs font-normal lowercase leading-4 text-cv-ink-subtle"
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
                    <TableRow className="bg-cv-surface-sunken hover:bg-cv-surface-sunken">
                      <TableCell
                        colSpan={rows.length + 1}
                        className="h-8 py-1.5 text-[13px] font-medium leading-[18px] text-cv-ink-muted"
                      >
                        {header === "uncategorised" ? "Not categorised" : CATEGORY_LABELS[header]}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell
                      className="font-medium text-cv-ink"
                      title={`Classified by rule: ${rule}`}
                    >
                      {formatComponentName(entry.key)}
                      <span className="block font-cv-mono text-xs font-normal leading-4 text-cv-ink-subtle">
                        {entry.key}
                      </span>
                    </TableCell>
                    {entry.values.map((value, index) => {
                      const slot = rows[index];
                      const previousSlot = index > 0 ? rows[index - 1] : undefined;
                      // A period with no register for this employee gets a
                      // dash with its reason, never the blank that means "the
                      // column was not on the register".
                      const noRegister =
                        slot !== undefined && (slot.kind === "missing" || slot.kind === "not_paid");
                      const moved = movement(
                        value,
                        index > 0 ? (entry.values[index - 1] ?? null) : null,
                        slot?.kind === "actual" && previousSlot?.kind === "actual",
                        file.decimals,
                      );
                      return (
                        <TableCell
                          key={slot?.index ?? index}
                          className="text-right"
                          title={
                            noRegister && slot
                              ? (slotKindReason(slot.kind, slot.rowCount) ?? undefined)
                              : undefined
                          }
                        >
                          {noRegister ? (
                            <span className="text-cv-ink-subtle">—</span>
                          ) : value === null ? (
                            ""
                          ) : (
                            <span className="inline-flex items-center justify-end gap-1">
                              {moved && (
                                <>
                                  <Icon
                                    name={moved === "up" ? "arrow-up" : "arrow-down"}
                                    size={14}
                                    strokeWidth={2}
                                    className={
                                      moved === "up"
                                        ? "text-cv-delta-up-ink"
                                        : "text-cv-delta-down-ink"
                                    }
                                  />
                                  <span className="sr-only">
                                    {moved === "up" ? "Increase" : "Decrease"}
                                  </span>
                                </>
                              )}
                              <span className="cv-num">{formatMoney(value, file.currency)}</span>
                            </span>
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
        <PanelFoot className="justify-start">
          <p className="m-0 text-cv-ink-muted">
            {uncategorised.length} {uncategorised.length === 1 ? "column" : "columns"} could not be
            placed by the classifier, so {uncategorised.length === 1 ? "its value" : "their values"}{" "}
            sit in the unmapped balance rather than in a category.{" "}
            <Link href="/annual-salaries" className="font-medium text-cv-accent underline">
              Categorise them on the annual dashboard
            </Link>{" "}
            and this file follows, because both read the same saved categories.
          </p>
        </PanelFoot>
      )}
    </Panel>
  );
}
