import type { PeriodType } from "../annual/types";
import { endOfMonth, monthStart } from "../annual/test-utils";
import type { EmployeePeriodInput, EmployeeSnapshotRow } from "./types";

/**
 * Hand-built inputs for the Employee File engine tests. Pure, no database.
 *
 * Follows `annual/test-utils.ts`: the engine's correctness is where the
 * arithmetic lives, and it runs in milliseconds, so it is tested here rather
 * than through the router.
 */

let counter = 0;

export function resetIds(): void {
  counter = 0;
}

export interface MonthSpec {
  month: number;
  gross: number;
  net: number;
  components?: Record<string, number | null>;
  department?: string | null;
  name?: string;
  hireDate?: string | null;
  terminationDate?: string | null;
  fte?: number | null;
  dimensions?: Record<string, string>;
  currency?: string;
  /** More than one row in the same period is spec 7.3's duplicate. */
  extraRows?: { gross: number; net: number; components?: Record<string, number | null> }[];
  /** A second upload of the same window, for spec 7.1's re-upload. */
  createdAt?: string;
}

export function monthPeriod(
  year: number,
  spec: MonthSpec,
  cadence: PeriodType = "monthly",
): EmployeePeriodInput {
  const start = monthStart(year, spec.month);
  const end = endOfMonth(year, spec.month);
  const rowGross = [spec.gross, ...(spec.extraRows ?? []).map((r) => r.gross)];
  const rowNet = [spec.net, ...(spec.extraRows ?? []).map((r) => r.net)];
  return {
    id: `period-${year}-${spec.month}-${(spec.createdAt ?? "a").slice(0, 10)}`,
    periodType: cadence,
    currency: spec.currency ?? "USD",
    periodStart: start,
    periodEnd: end,
    createdAt: spec.createdAt ?? `${end}T12:00:00Z`,
    // `payroll_periods.total_gross` is the sum of EVERY row, because
    // `processUpload` accumulates them — which is why summing duplicates is
    // what ties to the register.
    totalGross: rowGross.reduce((a, b) => a + b, 0),
    totalNet: rowNet.reduce((a, b) => a + b, 0),
    controlTotalGross: null,
    controlTotalNet: null,
  };
}

export function monthRows(
  year: number,
  spec: MonthSpec,
  externalId = "E0002",
  cadence: PeriodType = "monthly",
): EmployeeSnapshotRow[] {
  const period = monthPeriod(year, spec, cadence);
  const common = {
    payrollPeriodId: period.id,
    employeeExternalId: externalId,
    employeeName: spec.name ?? "Employee E0002",
    department: spec.department ?? "Engineering",
    currency: spec.currency ?? "USD",
    hireDate: spec.hireDate ?? null,
    terminationDate: spec.terminationDate ?? null,
    fte: spec.fte ?? null,
    dimensions: spec.dimensions ?? {},
  };

  const rows: EmployeeSnapshotRow[] = [
    {
      id: `snap-${(counter += 1)}`,
      ...common,
      gross: spec.gross,
      net: spec.net,
      components: spec.components ?? {},
    },
  ];

  for (const extra of spec.extraRows ?? []) {
    rows.push({
      id: `snap-${(counter += 1)}`,
      ...common,
      gross: extra.gross,
      net: extra.net,
      components: extra.components ?? {},
    });
  }

  return rows;
}

export interface BuiltYear {
  periods: EmployeePeriodInput[];
  rows: EmployeeSnapshotRow[];
}

/** Periods and rows for a list of month specs, in one call. */
export function buildYear(
  year: number,
  specs: readonly MonthSpec[],
  externalId = "E0002",
  cadence: PeriodType = "monthly",
): BuiltYear {
  resetIds();
  return {
    periods: specs.map((spec) => monthPeriod(year, spec, cadence)),
    rows: specs.flatMap((spec) => monthRows(year, spec, externalId, cadence)),
  };
}

/** The deductions every month of the E0002 fixture carries. */
export const E0002_DEDUCTIONS = {
  "Income Tax": 4614.38,
  "Social Security Employee": 1125.0,
} as const;

/** The employer side, so K13 and K14 have something to read. */
export function e0002Employer(month: number): Record<string, number> {
  return {
    // 930.78 x 11 + 930.72 = 11,169.30 exactly, which is the figure spec 8.1
    // states for the year.
    "Employer Social Security": month === 12 ? 930.72 : 930.78,
    "Health Insurance Employer": 969.87,
    "End of Service Provision": 420.0,
  };
}

const RECURRING_H1 = {
  "Base Salary": 16187.41,
  "Housing Allowance": 2913.73,
  "Transport Allowance": 400.0,
  "Meal Allowance": 250.0,
};

const RECURRING_H2 = {
  // The July event, per component: base +679.87 (+4.20%), housing +122.38
  // (+4.20%), transport and meal flat. Recurring pay +802.25 (+4.06%) — the
  // run-rate percentage is NOT the increase percentage, which is exactly why a
  // rate variance must be named per component.
  "Base Salary": 16867.28,
  "Housing Allowance": 3036.11,
  "Transport Allowance": 400.0,
  "Meal Allowance": 250.0,
};

/** Extra earnings by month: variable pay and uncategorised reimbursements. */
const E0002_EXTRAS: Readonly<Record<number, Record<string, number>>> = {
  3: { Bonus: 15669.19, Overtime: 4842.19 },
  4: { Overtime: 5052.72 },
  9: { "Expense Reimbursement": 1906.38 },
  11: { "Expense Reimbursement": 786.46 },
  12: { Bonus: 5206.1, "Expense Reimbursement": 911.9 },
};

export const E0002_GROSS: readonly number[] = [
  19751.14, 19751.14, 40262.52, 24803.86, 19751.14, 19751.14,
  20553.39, 20553.39, 22459.77, 20553.39, 21339.85, 26671.39,
];

/** Income tax plus employee social security, every month. */
export const E0002_DEDUCTION_PER_MONTH = 4614.38 + 1125.0;

/**
 * Spec 8.1's worked example: E0002, `samples/2025`, FY2025, USD, monthly.
 *
 * Every figure the spec asserts is reproducible from this, which is the point:
 * if `totals.test.ts` passes against it, blocking gap B1 is discharged.
 */
export function e0002Year(opts: { months?: readonly number[] } = {}): BuiltYear {
  const months = opts.months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const specs: MonthSpec[] = months.map((month) => {
    const grossIndex = month - 1;
    const gross = E0002_GROSS[grossIndex];
    if (gross === undefined) throw new Error(`No gross for month ${month}`);
    return {
      month,
      gross,
      net: Number((gross - E0002_DEDUCTION_PER_MONTH).toFixed(2)),
      components: {
        ...(month <= 6 ? RECURRING_H1 : RECURRING_H2),
        ...(E0002_EXTRAS[month] ?? {}),
        ...E0002_DEDUCTIONS,
        ...e0002Employer(month),
      },
    };
  });
  return buildYear(2025, specs, "E0002");
}
