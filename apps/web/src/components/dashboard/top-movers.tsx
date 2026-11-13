"use client";

import { Panel, Variance } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface MoverRow {
  employeeName: string;
  department: string | null;
  previousNet: number;
  currentNet: number;
  changeAmount: number;
  changePercentage: number | null;
}

interface TopMoversProps {
  movers?: MoverRow[];
  currency: string;
  previousLabel?: string;
  currentLabel?: string;
}

/**
 * The largest changes in net pay (redesign canvas: Dashboard, "Top movers").
 * Same table anatomy as the department table: names in ink, departments ink-muted,
 * figures in Geist Mono right-aligned, the change as a Variance.
 */
export function TopMovers({ movers, currency, previousLabel, currentLabel }: TopMoversProps) {
  const money = (n: number) => formatCurrency(n, currency);

  return (
    <Panel
      headingId="movers-h"
      title="Top movers"
      description="The largest changes in net pay, in either direction."
    >
      {!movers ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : movers.length === 0 ? (
        <p className="m-0 py-8 text-center text-sm leading-5 text-cv-ink-subtle">
          Nobody&apos;s net pay changed.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-cv-lg border border-cv-line">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Net pay {previousLabel ?? "previous"}</TableHead>
                <TableHead className="text-right">Net pay {currentLabel ?? "current"}</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movers.map((mover, index) => (
                <TableRow key={`${mover.employeeName}-${index}`}>
                  <TableCell className="font-medium">{mover.employeeName}</TableCell>
                  <TableCell className="text-cv-ink-muted">{mover.department ?? "—"}</TableCell>
                  <TableCell className="cv-num text-cv-ink-muted">
                    {money(mover.previousNet)}
                  </TableCell>
                  <TableCell className="cv-num">{money(mover.currentNet)}</TableCell>
                  <TableCell className="text-right">
                    <Variance
                      value={mover.changeAmount}
                      percent={mover.changePercentage}
                      format={money}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
