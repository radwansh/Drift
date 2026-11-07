/**
 * The two Employee File fixtures that have to go through the real upload
 * (section 8 of docs/EMPLOYEE_FILE_PLAN.md).
 *
 *   pnpm samples:employee-file            # writes to <repo root>/samples/employee-file
 *   pnpm samples:employee-file -- <dir>   # or somewhere else
 *
 * Seven of the nine v1 fixtures are engine fixtures, built in
 * `packages/payroll-core/src/employee/test-utils.ts` and asserted there, because
 * what they test is arithmetic. These two are different: what they test is what
 * the **writer** does.
 *
 *   - `duplicate-row` — `processUpload` inserts every row of a period in one
 *     statement, so `created_at` is identical across them and a
 *     `DISTINCT ON ... created_at DESC` tie-break picks arbitrarily; and
 *     `payroll_periods.total_gross` accumulates **every** row, which is why
 *     summing duplicates is what ties to the register. Neither fact is a
 *     property of the engine, so an engine fixture would assume the thing under
 *     test.
 *   - `reupload` — `processUpload` always inserts, nothing deletes, and both
 *     periods end up `ready`. De-duplication is `dedupePeriods`' job at read
 *     time, and the same reasoning applies.
 *
 * Deterministic by construction: every figure below is a literal, so a re-run
 * writes byte-identical files and a bug found against them stays reproducible.
 *
 * Both registers **reconcile**, which is a precondition rather than a detail:
 * `payrollPeriods.ingest` runs the reconciliation gate before `processUpload`
 * and refuses a register that does not balance. `samples/payroll_july_2026.csv`
 * breaches the earnings identity by 520.00 and would be refused — the gate
 * turning a fixture away for an unrelated reason is a confusing afternoon, so:
 *
 *   gross = base + allowances
 *   net   = gross - income tax - employee social security
 *
 * Deductions are written as **positive** numbers, matching
 * `samples/payroll_june_2026.csv` and the 2025 generator. Employer costs sit on
 * top of gross, never inside it.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/** The mapping shape `payrollPeriods.ingest` and `processUpload` both take. */
export interface FixtureMapping {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
}

/**
 * A type alias rather than an interface, deliberately: only an alias of an
 * object type gets TypeScript's implicit index signature, and without one these
 * rows are not assignable to the `Record<string, unknown>` that
 * `payrollPeriods.ingest` takes.
 */
export type FixtureRow = {
  "Employee ID": string;
  "Full Name": string;
  Department: string;
  "Base Salary": string;
  "Housing Allowance": string;
  "Income Tax": string;
  "Social Security Employee": string;
  "Employer Social Security": string;
  "Gross Salary": string;
  "Net Salary": string;
};

export const FIXTURE_HEADERS: readonly (keyof FixtureRow)[] = [
  "Employee ID",
  "Full Name",
  "Department",
  "Base Salary",
  "Housing Allowance",
  "Income Tax",
  "Social Security Employee",
  "Employer Social Security",
  "Gross Salary",
  "Net Salary",
];

/**
 * The identifier headers are exactly the ones the upload modal auto-maps, and
 * every component header was chosen so `classifyComponent` places it — an
 * unplaceable column would raise an unanswered-ambiguity error at the gate and
 * the fixture would never reach the writer.
 */
export const FIXTURE_MAPPINGS: readonly FixtureMapping[] = [
  {
    sourceColumn: "Employee ID",
    mappedComponent: "",
    isEmployeeId: true,
    isEmployeeName: false,
    isDepartment: false,
    isGrossSalary: false,
    isNetSalary: false,
  },
  {
    sourceColumn: "Full Name",
    mappedComponent: "",
    isEmployeeId: false,
    isEmployeeName: true,
    isDepartment: false,
    isGrossSalary: false,
    isNetSalary: false,
  },
  {
    sourceColumn: "Department",
    mappedComponent: "",
    isEmployeeId: false,
    isEmployeeName: false,
    isDepartment: true,
    isGrossSalary: false,
    isNetSalary: false,
  },
  {
    sourceColumn: "Gross Salary",
    mappedComponent: "",
    isEmployeeId: false,
    isEmployeeName: false,
    isDepartment: false,
    isGrossSalary: true,
    isNetSalary: false,
  },
  {
    sourceColumn: "Net Salary",
    mappedComponent: "",
    isEmployeeId: false,
    isEmployeeName: false,
    isDepartment: false,
    isGrossSalary: false,
    isNetSalary: true,
  },
  ...(
    [
      "Base Salary",
      "Housing Allowance",
      "Income Tax",
      "Social Security Employee",
      "Employer Social Security",
    ] as const
  ).map((column) => ({
    sourceColumn: column,
    mappedComponent: column,
    isEmployeeId: false,
    isEmployeeName: false,
    isDepartment: false,
    isGrossSalary: false,
    isNetSalary: false,
  })),
];

const money = (n: number) => n.toFixed(2);

/** One employee, with gross and net derived so the register reconciles. */
function employee(opts: {
  id: string;
  name: string;
  department: string;
  base: number;
  housing: number;
}): FixtureRow {
  const gross = opts.base + opts.housing;
  const incomeTax = Math.round(gross * 0.1 * 100) / 100;
  const socialSecurity = Math.round(gross * 0.05 * 100) / 100;
  return {
    "Employee ID": opts.id,
    "Full Name": opts.name,
    Department: opts.department,
    "Base Salary": money(opts.base),
    "Housing Allowance": money(opts.housing),
    "Income Tax": money(incomeTax),
    "Social Security Employee": money(socialSecurity),
    "Employer Social Security": money(Math.round(gross * 0.08 * 100) / 100),
    "Gross Salary": money(gross),
    "Net Salary": money(gross - incomeTax - socialSecurity),
  };
}

const ADA = employee({
  id: "E001",
  name: "Ada Okonkwo",
  department: "Engineering",
  base: 5000,
  housing: 500,
});
const GRACE = employee({
  id: "E002",
  name: "Grace Haddad",
  department: "Engineering",
  base: 4000,
  housing: 400,
});
const KATHERINE = employee({
  id: "E003",
  name: "Katherine Aoun",
  department: "Finance",
  base: 3000,
  housing: 300,
});
/** The correction the re-upload carries: E003's base was understated. */
const KATHERINE_CORRECTED = employee({
  id: "E003",
  name: "Katherine Aoun",
  department: "Finance",
  base: 3300,
  housing: 300,
});

export interface UploadFixture {
  name: string;
  filename: string;
  periodType: "monthly";
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  rows: FixtureRow[];
  mappings: readonly FixtureMapping[];
}

/**
 * Spec 7.3: one employee twice in one period.
 *
 * **This register cannot be ingested through `payrollPeriods.ingest`.** The
 * validator treats a repeated employee id as an `error`, not a warning, and the
 * procedure refuses on `valid: false` before `processUpload` runs — the gate is
 * at the door, deliberately, because as a warning the period was marked `ready`
 * with both rows in it and the comparison then silently dropped one.
 *
 * So duplicate rows in `employee_snapshots` can only be data written before
 * that gate existed, or by a path that skips it. That is worth knowing: the
 * Employee File's sum-and-flag behaviour is about historical data, and the
 * fixture's job is to exercise the writer (`processUpload` directly) and to
 * prove the gate refuses the same rows.
 */
export function duplicateRowFixture(): UploadFixture {
  return {
    name: "duplicate-row",
    filename: "employee-file-duplicate-row.csv",
    periodType: "monthly",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    currencyCode: "USD",
    // E002 twice, byte-identical — the duplicated-export shape, which is the
    // one nothing in the data can tell from a genuine second payment.
    rows: [ADA, GRACE, GRACE, KATHERINE],
    mappings: FIXTURE_MAPPINGS,
  };
}

/**
 * Spec 7.1: the same window uploaded twice, the second correcting the first.
 *
 * Both periods are written and both end up `ready`, because `processUpload`
 * always inserts and nothing deletes. `dedupePeriods` keeps the newest at read
 * time and `countSupersededUploads` reports the one it dropped, so K1 must be
 * identical with and without the superseded upload.
 */
export function reuploadFixture(): { first: UploadFixture; second: UploadFixture } {
  const window = {
    periodType: "monthly" as const,
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    currencyCode: "USD",
  };
  return {
    first: {
      name: "reupload-first",
      filename: "employee-file-reupload-1.csv",
      ...window,
      rows: [ADA, GRACE, KATHERINE],
      mappings: FIXTURE_MAPPINGS,
    },
    second: {
      name: "reupload-corrected",
      filename: "employee-file-reupload-2.csv",
      ...window,
      rows: [ADA, GRACE, KATHERINE_CORRECTED],
      mappings: FIXTURE_MAPPINGS,
    },
  };
}

/** What the engine should make of each fixture. Asserted, not just documented. */
export const FIXTURE_EXPECTATIONS = {
  /** Σ over all four rows, which is what `payroll_periods.total_gross` holds. */
  duplicateRowTotalGross: 17_600,
  /** E002's slot total: both rows summed. */
  duplicateRowEmployeeGross: 8_800,
  /**
   * E003's gross in the duplicate-row period.
   *
   * She is in both fixtures, which is deliberate: it means a re-upload
   * assertion read off a *year* total would pass for the wrong reason, so the
   * re-upload has to be asserted on its own slot.
   */
  duplicateRowKatherineGross: 3_300,
  /** E003 after the correction: the newest upload only, never the sum. */
  reuploadCorrectedGross: 3_600,
  /** What the first upload said, and what must not be added to the above. */
  reuploadFirstGross: 3_300,
} as const;

/** RFC-4180-ish: quote a field only when it needs it. */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly FixtureRow[]): string {
  const lines = [FIXTURE_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(FIXTURE_HEADERS.map((header) => csvField(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const out = process.argv[2] ?? resolve(__dirname, "../../../../../samples/employee-file");
  mkdirSync(out, { recursive: true });

  const duplicate = duplicateRowFixture();
  const { first, second } = reuploadFixture();

  for (const fixture of [duplicate, first, second]) {
    writeFileSync(join(out, fixture.filename), toCsv(fixture.rows), "utf8");
    console.log(`wrote ${fixture.filename} (${fixture.rows.length} rows)`);
  }
}

// `require.main` rather than an import-time side effect, so importing this from
// a test does not write files.
if (typeof require !== "undefined" && require.main === module) main();
