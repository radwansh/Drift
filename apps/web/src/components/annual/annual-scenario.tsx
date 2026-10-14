"use client";

import { useMemo, useState } from "react";
import { FlaskConical, TrendingDown, TrendingUp } from "lucide-react";
import type { AnnualSummary } from "@saas/payroll-core";
import { applyScenario, costPerHeadLatest, type Scenario } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatCompact } from "@/components/annual/annual-utils";

interface AnnualScenarioProps {
  summary: AnnualSummary;
}

/**
 * Scenario planner (step 43).
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
  const perHead = costPerHeadLatest(summary);
  const currency = summary.currency;
  const hasScenario = result.assumptions.length > 0;
  const worse = result.difference.totalEmploymentCost > 0;

  if (projectedSlots.length === 0) return null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Scenario planner
        </CardTitle>
        <CardDescription>
          Applies changes to the {projectedSlots.length} remaining{" "}
          {projectedSlots.length === 1 ? "period" : "periods"} only; actuals are never changed. Cost
          per head in the latest actual period is {formatMoney(perHead, currency)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <label htmlFor="scenario-people" className="text-xs font-medium text-muted-foreground">
              Headcount change
            </label>
            <input
              id="scenario-people"
              type="number"
              step={1}
              value={people}
              onChange={(e) => setPeople(Number(e.target.value) || 0)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="scenario-from" className="text-xs font-medium text-muted-foreground">
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

          <div className="space-y-1.5">
            <label htmlFor="scenario-increase" className="text-xs font-medium text-muted-foreground">
              Pay increase %
            </label>
            <input
              id="scenario-increase"
              type="number"
              step={0.5}
              value={increasePct}
              onChange={(e) => setIncreasePct(Number(e.target.value) || 0)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="scenario-bonus" className="text-xs font-medium text-muted-foreground">
              One-off bonus per head
            </label>
            <div className="flex gap-2">
              <input
                id="scenario-bonus"
                type="number"
                step={100}
                min={0}
                value={bonusPerHead}
                onChange={(e) => setBonusPerHead(Number(e.target.value) || 0)}
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Select value={String(bonusSlot)} onValueChange={(v) => setBonusSlot(Number(v))}>
                <SelectTrigger className="w-28" aria-label="Bonus period">
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
        </div>

        {hasScenario ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Baseline, full year</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCompact(result.baseline.totalEmploymentCost, currency)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Scenario, full year</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCompact(result.scenario.totalEmploymentCost, currency)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Difference</p>
                <p
                  className={cn(
                    "mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums",
                    worse ? "text-destructive" : "text-emerald-600 dark:text-emerald-500",
                  )}
                >
                  {worse ? (
                    <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  {formatMoney(Math.abs(result.difference.totalEmploymentCost), currency)}
                </p>
              </div>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
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
        ) : (
          <p className="text-sm text-muted-foreground">
            Enter a headcount change, a pay increase or a bonus to see its effect on the full year.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
