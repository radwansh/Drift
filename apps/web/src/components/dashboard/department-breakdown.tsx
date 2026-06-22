"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface DepartmentRow {
  department: string;
  headcountCurrent: number;
  headcountPrevious: number;
  totalCurrent: number;
  totalPrevious: number;
  absoluteChange: number;
  percentageChange: number | null;
}

interface DepartmentBreakdownProps {
  departments?: DepartmentRow[];
}

export function DepartmentBreakdown({ departments }: DepartmentBreakdownProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Department Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {!departments ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : departments.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No department data available
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Headcount (Current)</TableHead>
                  <TableHead className="text-right">Headcount (Previous)</TableHead>
                  <TableHead className="text-right">Payroll (Current)</TableHead>
                  <TableHead className="text-right">Payroll (Previous)</TableHead>
                  <TableHead className="text-right">Change ($)</TableHead>
                  <TableHead className="text-right">Change (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((dept) => {
                  const isPositive = dept.absoluteChange >= 0;
                  return (
                    <TableRow key={dept.department}>
                      <TableCell className="font-medium">{dept.department}</TableCell>
                      <TableCell className="text-right">{dept.headcountCurrent}</TableCell>
                      <TableCell className="text-right">{dept.headcountPrevious}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(dept.totalCurrent)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(dept.totalPrevious)}</TableCell>
                      <TableCell className={cn("text-right font-mono text-xs", isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                        {isPositive ? "+" : ""}{formatCurrency(dept.absoluteChange)}
                      </TableCell>
                      <TableCell className="text-right">
                        {dept.percentageChange !== null ? (
                          <Badge variant={isPositive ? "success" : "destructive"} className="text-[10px]">
                            {isPositive ? "+" : ""}{dept.percentageChange.toFixed(1)}%
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
