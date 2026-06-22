"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

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
}

export function TopMovers({ movers }: TopMoversProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Top Movers</CardTitle>
      </CardHeader>
      <CardContent>
        {!movers ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : movers.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No mover data available
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Previous Net</TableHead>
                  <TableHead className="text-right">Current Net</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Change %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movers.map((mover, index) => {
                  const isPositive = mover.changeAmount >= 0;
                  return (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{mover.employeeName}</TableCell>
                      <TableCell className="text-muted-foreground">{mover.department ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(mover.previousNet)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(mover.currentNet)}</TableCell>
                      <TableCell className={cn("text-right font-mono text-xs font-medium", isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                        {isPositive ? "+" : ""}{formatCurrency(mover.changeAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {mover.changePercentage !== null ? (
                          <Badge variant={isPositive ? "success" : "destructive"} className="text-[10px]">
                            {isPositive ? "+" : ""}{mover.changePercentage.toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
