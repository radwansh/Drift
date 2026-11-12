"use client";

import { Button, Notice } from "@/components/cv";
import {
  excludedByScopeSentence,
  CURRENTLY_EMPLOYED_UNKNOWN_NOTICE,
  DEPARTMENT_RULE_NOTICE,
} from "@/components/employee-file/employee-file-text";
import type { ListScope } from "@/components/employee-file/employee-list-url";

/**
 * The panel's foot: where in the set the page is, and the way to the next one
 * (step E2, board "Employee File: list").
 *
 * The sort is named here because the table can be ordered two ways — by the
 * server, over the whole filtered set, or on this page only — and a page of 50
 * rows out of 214 sorted on screen is not the order of the set. The header
 * marks the column; this line says it in words.
 */
export function EmployeeListFooter({
  shown,
  total,
  page,
  pageSize,
  sortLabel,
  onPageChange,
}: {
  shown: number;
  total: number;
  page: number;
  pageSize: number;
  /** "Critical flags", or "Department, this page only" for a client-side sort. */
  sortLabel: string | null;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : from + shown - 1;

  return (
    <>
      <p className="m-0">
        {total === 0 ? (
          "Nobody matches this scope and these filters."
        ) : (
          <>
            Showing {from}–{to} of {total}
            {sortLabel && ` · sorted by ${sortLabel}`}
          </>
        )}
      </p>

      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-[13px] leading-[18px] text-cv-ink-muted">
            Page {page} of {pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * What the scope and the filters did to the set, under the table.
 *
 * The excluded count is the point. Under `currently_employed` the list drops
 * everyone who has left, and "a filter that drops rows without saying how many
 * is how a payroll total gets signed off short" — so the count is a sentence
 * with the way back out of it, not an absence. The two that change how the rows
 * should be read are `Notice`s; the rest are quiet notes, as they were.
 */
export function EmployeeListNotes({
  scope,
  rangeLabel,
  excludedByScope,
  currentlyEmployedKnown,
  coveredSlots,
  supersededCount,
  departmentFiltered,
}: {
  scope: ListScope;
  rangeLabel: string;
  excludedByScope: number;
  /**
   * False when the latest covered slot is outside the selected range, so no row
   * can be told apart from a leaver. The scope is then unanswerable rather than
   * empty, and saying which is the difference between a list that dropped
   * everybody and a list that was asked the wrong question.
   */
  currentlyEmployedKnown: boolean;
  coveredSlots: number;
  supersededCount: number;
  departmentFiltered: boolean;
}) {
  const excluded = excludedByScopeSentence(excludedByScope, rangeLabel);
  // Nothing to say is nothing to render: an empty block would still take the
  // page's 24px gap under the table.
  const hasNotes =
    coveredSlots > 0 ||
    excluded !== null ||
    !currentlyEmployedKnown ||
    scope === "everyone_on_record" ||
    departmentFiltered;
  if (!hasNotes) return null;

  return (
    <div className="flex flex-col gap-3 text-[13px] leading-[18px] text-cv-ink-subtle">
      {coveredSlots > 0 && (
        <p className="m-0">
          {coveredSlots} {coveredSlots === 1 ? "period" : "periods"} uploaded in {rangeLabel}
          {supersededCount > 0 &&
            `, ${supersededCount} superseded ${
              supersededCount === 1 ? "upload" : "uploads"
            } ignored`}
          . Paid periods are counted against that.
        </p>
      )}

      {/* Under `currently_employed`, who is not on screen and how to see them. */}
      {excluded && <Notice tone="info">{excluded}</Notice>}

      {/* The scope cannot be answered from this range, which is not the same as
          nobody matching it. Without this the list reads as "everyone has
          left". */}
      {!currentlyEmployedKnown && (
        <Notice tone="warning">{CURRENTLY_EMPLOYED_UNKNOWN_NOTICE}</Notice>
      )}

      {scope === "everyone_on_record" && (
        <p className="m-0">
          Everyone on record ignores the range, so somebody with nothing in {rangeLabel} lists with
          no last paid slot and a dash where the money would be. A dash is &ldquo;nothing in this
          range&rdquo;, which is not a zero payment.
        </p>
      )}

      {departmentFiltered && <p className="m-0">{DEPARTMENT_RULE_NOTICE}</p>}
    </div>
  );
}
