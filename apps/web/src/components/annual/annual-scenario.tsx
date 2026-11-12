"use client";

import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { AnnualSummary } from "@saas/payroll-core";
import { applyScenario, costPerHeadForecast, type Scenario } from "@saas/payroll-core";
import { Button, Panel, TextField, Variance } from "@/components/cv";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatMoney, formatCompact } from "@/components/annual/annual-utils";

interface AnnualScenarioProps {
  summary: AnnualSummary;
}

/**
 * Scenario planner (step 43), on Ink & Signal.
 *
 * Runs in the browser against the summary already on screen, so the baseline a
 * user compares against is exactly what they are looking at and no round trip is
 * needed per keystroke.
 */
export function AnnualScenario({ summary }: AnnualScenarioProps) {
  const [people, setPeople] = useState(0);
  const [fromSlot, setFromSlot] = useState(1);
  const [increasePct, setIncreasePct] = useState(0);
  const [bonusPerHead, setBonusPerHead] = useState(0);
  const [bonusSlot, setBonusSlot] = useState(12);

  const projectedSlots = useMemo(
    () =>
      summary.periods
        .map((p, i) => ({ index: i + 1, label: p.label, kind: p.kind }))
        .filter((p) => p.kind !== "actual"),
    [summary],
  );

  const scenario: Scenario = useMemo(
    () => ({
      headcountChange: people !== 0 ? { fromSlotIndex: fromSlot, people } : undefined,
      salaryIncreasePct:
        increasePct !== 0 ? { fromSlotIndex: fromSlot, percent: increasePct } : undefined,
      oneOffBonus:
        bonusPerHead !== 0 ? { slotIndex: bonusSlot, amountPerHead: bonusPerHead } : undefined,
    }),
    [people, fromSlot, increasePct, bonusPerHead, bonusSlot],
  );

  const result = useMemo(() => applyScenario(summary, scenario), [summary, scenario]);
  const perHead = costPerHeadForecast(summary);
  const currency = summary.currency;
  const hasScenario = result.assumptions.length > 0;

  if (projectedSlots.length === 0) return null;

  return (
    <Panel
      headingId="annual-scenario-h"
      title={
        <span className="inline-flex items-center gap-2">
          <FlaskConical className="h-5 w-5 shrink-0 text-cv-ink-subtle" aria-hidden="true" />
          Scenario planner
        </span>
      }
      description={`Applies changes to the ${projectedSlots.length} remaining ${
        projectedSlots.length === 1 ? "period" : "periods"
      } only; actuals are never changed. Cost per head in the next projected period is ${formatMoney(
        perHead,
        currency,
      )}, excluding one-offs.`}
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TextField
            id="scenario-people"
            label="Headcount change"
            mono
            type="number"
            step={1}
            value={people}
            onChange={(e) => setPeople(Number(e.target.value) || 0)}
          />

          <div className="flex min-w-0 flex-col gap-1.5">
            <label
              htmlFor="scenario-from"
              className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink"
            >
              From period
            </label>
            <Select value={String(fromSlot)} onValueChange={(v) => setFromSlot(Number(v))}>
              <SelectTrigger id="scenario-from">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectedSlots.map((s) => (
                  <SelectItem key={s.index} value={String(s.index)}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TextField
            id="scenario-increase"
            label="Pay increase"
            mono
            suffix="%"
            type="number"
            step={0.5}
            value={increasePct}
            onChange={(e) => setIncreasePct(Number(e.target.value) || 0)}
          />

          <div className="flex min-w-0 flex-col gap-1.5">
            <TextField
              id="scenario-bonus"
              label="One-off bonus per head"
              mono
              prefix={currency}
              type="number"
              step={100}
              min={0}
              value={bonusPerHead}
              onChange={(e) => setBonusPerHead(Number(e.target.value) || 0)}
            />
            <Select value={String(bonusSlot)} onValueChange={(v) => setBonusSlot(Number(v))}>
              <SelectTrigger aria-label="Bonus period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectedSlots.map((s) => (
                  <SelectItem key={s.index} value={String(s.index)}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {hasScenario ? (
          <div className="flex flex-col gap-3 rounded-cv-lg border border-cv-line p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="min-w-0">
                <p className="m-0 text-xs font-medium leading-4 text-cv-ink-muted">
                  Baseline, full year
                </p>
                <p className="m-0 mt-1 text-lg font-semibold leading-6 tabular-nums text-cv-ink">
                  {formatCompact(result.baseline.totalEmploymentCost, currency)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="m-0 text-xs font-medium leading-4 text-cv-ink-muted">
                  Scenario, full year
                </p>
                <p className="m-0 mt-1 text-lg font-semibold leading-6 tabular-nums text-cv-ink">
                  {formatCompact(result.scenario.totalEmploymentCost, currency)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="m-0 text-xs font-medium leading-4 text-cv-ink-muted">Difference</p>
                {/* A signed change: arrow, sign and colour, with the amount
                    through the money formatter. Costing more is rust. */}
                <span className="mt-1 block">
                  <Variance
                    value={result.difference.totalEmploymentCost}
                    size="lg"
                    format={(n) => formatMoney(n, currency)}
                  />
                </span>
              </div>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs leading-4 text-cv-ink-subtle">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPeople(0);
                  setIncreasePct(0);
                  setBonusPerHead(0);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        ) : (
          <p className="m-0 text-sm leading-5 text-cv-ink-muted">
            Enter a headcount change, a pay increase or a bonus to see its effect on the full year.
          </p>
        )}
      </div>
    </Panel>
  );
}
