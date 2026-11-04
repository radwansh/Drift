"use client";

import { Button } from "@/components/ui/button";
import {
  excludedByScopeSentence,
  CURRENTLY_EMPLOYED_UNKNOWN_NOTICE,
  DEPARTMENT_RULE_NOTICE,
} from "@/components/employee-file/employee-file-text";
import type { ListScope } from "@/components/employee-file/employee-list-url";

/**
 * The list footer: coverage, pagination, and what a filter dropped (step E2).
 *
 * The excluded count is the point. Under `currently_employed` the list drops
 * everyone who has left, and "a filter that drops rows without saying how many
 * is how a payroll total gets signed off short" — so the count is a sentence
 * with the way back out of it, not an absence.
 */
export function EmployeeListFooter({
  shown,
  total,
  page,
  pageSize,
  scope,
  rangeLabel,
  excludedByScope,
  currentlyEmployedKnown,
  coveredSlots,
  supersededCount,
  departmentFiltered,
  onPageChange,
}: {
  shown: number;
  total: number;
  page: number;
  pageSize: number;
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
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : from + shown - 1;
  const excluded = excludedByScopeSentence(excludedByScope, rangeLabel);

  return (
    <div className="space-y-3 border-t pt-4 text-sm text-muted-foreground">
      <p>
        {total === 0
          ? "Nobody matches this scope and these filters."
          : `Showing ${from}–${to} of ${total}.`}{" "}
        {coveredSlots > 0 && (
          <>
            {coveredSlots} {coveredSlots === 1 ? "period" : "periods"} uploaded in {rangeLabel}
            {supersededCount > 0 &&
              `, ${supersededCount} superseded ${
                supersededCount === 1 ? "upload" : "uploads"
              } ignored`}
            . Paid periods are counted against that.
          </>
        )}
      </p>

      {/* Under `currently_employed`, who is not on screen and how to see them. */}
      {excluded && <p className="text-foreground">{excluded}</p>}

      {/* The scope cannot be answered from this range, which is not the same as
          nobody matching it. Without this the list reads as "everyone has
          left". */}
      {!currentlyEmployedKnown && (
        <p className="text-foreground">{CURRENTLY_EMPLOYED_UNKNOWN_NOTICE}</p>
      )}

      {scope === "everyone_on_record" && (
        <p>
          Everyone on record ignores the range, so somebody with nothing in {rangeLabel} lists
          with no last paid slot and a dash where the money would be. A dash is &ldquo;nothing
          in this range&rdquo;, which is not a zero payment.
        </p>
      )}

      {departmentFiltered && <p>{DEPARTMENT_RULE_NOTICE}</p>}

      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
