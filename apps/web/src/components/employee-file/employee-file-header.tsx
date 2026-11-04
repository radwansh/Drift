"use client";

import type { EmployeeFileResult, PeriodType } from "@saas/payroll-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatRatio } from "@/components/annual/annual-utils";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";
import { coverageSentence, statusSentence } from "@/components/employee-file/employee-file-text";

/**
 * The identity header (step E5, spec 4.1).
 *
 * Two rules here are about what is *not* rendered.
 *
 * `hire_date`, `termination_date` and `fte` appear only when the company mapped
 * a column for them. When they did not, the header says `Hire date not mapped`
 * **once** — an em dash in a field labelled "Hire date" reads as "no hire date
 * on file", which is a statement about the employee rather than about the
 * register.
 *
 * And there is **no `id may have changed` badge**. `detectIdChangeCandidates`
 * (spec 7.4) is implemented and tested, but it needs the company's roster to
 * bucket by normalised name, and `employeeFile.get` fetches one employee's rows
 * and no roster — so the router returns `idMayHaveChanged: false` always.
 * Rendering a badge off that flag would make its absence read as evidence that
 * the id is stable, which is a stronger claim than the data supports. The
 * reused-id flag *is* computed, so it is shown.
 */
export function EmployeeFileHeader({
  file,
  scopeLabel,
  onScopeChange,
}: {
  file: EmployeeFileResult;
  scopeLabel: string;
  onScopeChange: (option: { periodType?: PeriodType; currency?: string }) => void;
}) {
  /**
   * Each date resolved from its **own** slot series, not from one slot that
   * happened to carry either of them.
   *
   * Registers carry `hire_date` on every row and `termination_date` only in the
   * final run, so "the first slot with a hire date or a termination date" was
   * always slot 1, its `terminationDate` was always null, and because its
   * `hireDate` was truthy the card printed "None on the register" — on the same
   * card whose badge read `Left Jun 2026`.
   *
   * The hire date is the first on record and the termination date the last: a
   * termination only exists once, in the final run, and taking the first slot
   * that has one is the same mistake in the other direction.
   */
  const hireDateSlot = file.slots.find((slot) => slot.hireDate !== null);
  const terminationSlot = [...file.slots]
    .reverse()
    .find((slot) => slot.terminationDate !== null);
  const withFte = file.slots.find((slot) => slot.fte !== null);
  const latestPaid = [...file.slots].reverse().find((slot) => slot.gross !== null);
  const dimensions = Object.entries(latestPaid?.dimensions ?? {});

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold">{file.latestName ?? file.externalId}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {file.externalId}
              {file.latestDepartment && ` · ${file.latestDepartment}`}
            </p>
            {file.priorNames.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Also in this range as {file.priorNames.join(", ")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              {statusSentence(file.presence.status)}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {PERIOD_TYPE_LABELS[file.cadence] ?? file.cadence} · {file.currency}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {scopeLabel}
            </Badge>
            {file.presence.status.idMayBeReused && (
              <Badge variant="outline" className="font-normal text-amber-600 dark:text-amber-500">
                This id may have been reused
              </Badge>
            )}
          </div>
        </div>

        {/* Coverage, stated once. This is the honest label a "no anomalies —
            all clear" badge would replace with a false one. */}
        <p className="text-sm text-muted-foreground">{coverageSentence(file.kpis.coverage)}</p>

        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Hire date</dt>
            <dd>
              {hireDateSlot?.hireDate ? (
                <>
                  {hireDateSlot.hireDate}
                  {file.presence.hireDates.length > 1 && (
                    <span className="block text-xs text-muted-foreground">
                      Also seen as {file.presence.hireDates.slice(1).join(", ")} — the register
                      usually carries the latest, so both are shown rather than one.
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Hire date not mapped</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Termination date</dt>
            <dd>
              {/*
                One fallback, not two. A null `termination_date` is the same
                value whether the column is unmapped or mapped and empty, and
                the slot series cannot tell those apart for one employee — so
                the wording stays a statement about the register, which is the
                safer of the two errors. The status badge above already says
                whether this person stopped being paid, and says which slot it
                read that off.
              */}
              {terminationSlot?.terminationDate ?? (
                <span className="text-muted-foreground">
                  No termination date on this register
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">FTE</dt>
            <dd>
              {/* A ratio, through the ratio formatter: never `formatMoney`, and
                  not raw, so 0.875 and 1 print the same way. */}
              {withFte?.fte != null ? (
                formatRatio(withFte.fte)
              ) : (
                <span className="text-muted-foreground">FTE not mapped</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tenure</dt>
            <dd>
              {file.presence.tenureMonths !== null ? (
                `${file.presence.tenureMonths} months`
              ) : (
                <span className="text-muted-foreground">
                  {file.presence.tenureSuppressed === "spans_gap"
                    ? "Two spells on record, so no single tenure figure"
                    : "Needs a mapped hire date"}
                </span>
              )}
            </dd>
          </div>
        </dl>

        {dimensions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {dimensions.map(([key, value]) => (
              <Badge key={key} variant="outline" className="font-normal">
                {key}: {value}
              </Badge>
            ))}
          </div>
        )}

        {/* Other scopes are named, never merged: there is no combined figure
            anywhere, no FX and no "equivalent", and `assignSlot` run with the
            wrong cadence collapses two semi-monthly slots into one month. */}
        {(file.otherCurrencies.length > 0 || file.otherCadences.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-sm">
            <span className="text-muted-foreground">
              This employee also has rows in another scope. They are not added to the figures
              here:
            </span>
            {file.otherCurrencies.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onScopeChange({ currency: code })}
                className="rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-muted/70"
              >
                {code}
              </button>
            ))}
            {file.otherCadences.map((cadence) => (
              <button
                key={cadence}
                type="button"
                onClick={() => onScopeChange({ periodType: cadence })}
                className="rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-muted/70"
              >
                {PERIOD_TYPE_LABELS[cadence] ?? cadence}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
