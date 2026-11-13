"use client";

import type { EmployeeFileResult, PeriodType } from "@saas/payroll-core";
import { Badge, Button, Notice, Panel } from "@/components/cv";
import { formatRatio } from "@/components/annual/annual-utils";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";
import { coverageSentence, statusSentence } from "@/components/employee-file/employee-file-text";

/**
 * The identity header (step E5, spec 4.1), on Ink & Signal (canvas board
 * "Employee File: one person").
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
 * reused-id flag *is* computed, so it is shown — as a `Notice`, because the
 * amber-tinted badge it used to be said "warning" in colour alone.
 */

/** One fact in the 4-column `dl`. A missing one states what is unmapped. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-medium leading-[18px] text-cv-ink-subtle">{label}</dt>
      <dd className="m-0 mt-0.5 text-sm leading-5 text-cv-ink">{children}</dd>
    </div>
  );
}

/** A fact the register does not carry. Never an em dash: that reads as "none". */
function NotMapped({ children }: { children: React.ReactNode }) {
  return <span className="text-cv-ink-subtle">{children}</span>;
}

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
  const terminationSlot = [...file.slots].reverse().find((slot) => slot.terminationDate !== null);
  const withFte = file.slots.find((slot) => slot.fte !== null);
  const latestPaid = [...file.slots].reverse().find((slot) => slot.gross !== null);
  const dimensions = Object.entries(latestPaid?.dimensions ?? {});

  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-medium leading-[18px] text-cv-ink-subtle">
              Employee File · {scopeLabel}
            </p>
            {/* The page's heading: this screen has no PageHeader, because the
                name and the scope it is read at belong together in one card. */}
            <h1 className="m-0 mt-0.5 text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-cv-ink">
              {file.latestName ?? file.externalId}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-cv-sm bg-cv-surface-sunken px-2 py-0.5 font-cv-mono text-xs leading-5 text-cv-ink-muted">
                {file.externalId}
              </span>
              {file.latestDepartment && (
                <span className="text-sm leading-5 text-cv-ink-muted">{file.latestDepartment}</span>
              )}
              <Badge tone="neutral">{statusSentence(file.presence.status)}</Badge>
            </div>
            {file.priorNames.length > 0 && (
              <p className="m-0 mt-2 text-[13px] leading-[18px] text-cv-ink-subtle">
                Also in this range as {file.priorNames.join(", ")}
              </p>
            )}
          </div>
          {/* The scope the figures are in, never mixed with another. */}
          <Badge tone="neutral">
            {PERIOD_TYPE_LABELS[file.cadence] ?? file.cadence} · {file.currency}
          </Badge>
        </div>

        {/* Coverage, stated once. This is the honest label a "no anomalies —
            all clear" badge would replace with a false one. */}
        <p className="m-0 text-sm leading-5 text-cv-ink-muted">
          {coverageSentence(file.kpis.coverage)}
        </p>

        {file.presence.status.idMayBeReused && (
          <Notice tone="warning" title="This id may have been reused">
            The same external id carries a materially different name after a gap in this range. It
            is reported rather than resolved: a recycled staff number is a different person, and
            merging their year is worse than splitting it.
          </Notice>
        )}

        <dl className="m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Hire date">
            {hireDateSlot?.hireDate ? (
              <>
                {hireDateSlot.hireDate}
                {file.presence.hireDates.length > 1 && (
                  <span className="mt-0.5 block text-xs leading-4 text-cv-ink-subtle">
                    Also seen as {file.presence.hireDates.slice(1).join(", ")} — the register
                    usually carries the latest, so both are shown rather than one.
                  </span>
                )}
              </>
            ) : (
              <NotMapped>Hire date not mapped</NotMapped>
            )}
          </Fact>

          <Fact label="Termination date">
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
              <NotMapped>No termination date on this register</NotMapped>
            )}
          </Fact>

          <Fact label="FTE">
            {/* A ratio, through the ratio formatter: never `formatMoney`, and
                not raw, so 0.875 and 1 print the same way. */}
            {withFte?.fte != null ? (
              <span className="cv-num">{formatRatio(withFte.fte)}</span>
            ) : (
              <NotMapped>FTE not mapped</NotMapped>
            )}
          </Fact>

          <Fact label="Tenure">
            {file.presence.tenureMonths !== null ? (
              `${file.presence.tenureMonths} months`
            ) : (
              <NotMapped>
                {file.presence.tenureSuppressed === "spans_gap"
                  ? "Two spells on record, so no single tenure figure"
                  : "Needs a mapped hire date"}
              </NotMapped>
            )}
          </Fact>
        </dl>

        {dimensions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {dimensions.map(([key, value]) => (
              <Badge key={key} tone="neutral">
                {key}: {value}
              </Badge>
            ))}
          </div>
        )}

        {/* Other scopes are named, never merged: there is no combined figure
            anywhere, no FX and no "equivalent", and `assignSlot` run with the
            wrong cadence collapses two semi-monthly slots into one month. */}
        {(file.otherCurrencies.length > 0 || file.otherCadences.length > 0) && (
          <Notice tone="warning" title="This employee also has rows in another scope">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-cv-ink-muted">They are not added to the figures here:</span>
              {file.otherCurrencies.map((code) => (
                <Button
                  key={code}
                  variant="secondary"
                  size="sm"
                  onClick={() => onScopeChange({ currency: code })}
                >
                  {code}
                </Button>
              ))}
              {file.otherCadences.map((cadence) => (
                <Button
                  key={cadence}
                  variant="secondary"
                  size="sm"
                  onClick={() => onScopeChange({ periodType: cadence })}
                >
                  {PERIOD_TYPE_LABELS[cadence] ?? cadence}
                </Button>
              ))}
            </div>
          </Notice>
        )}
      </div>
    </Panel>
  );
}
