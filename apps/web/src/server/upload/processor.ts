import { requireDb, type DbClient } from "@saas/db";
import { eq } from "drizzle-orm";
import {
  payrollPeriods,
  employeeSnapshots,
  uploadSessions,
  rebuildPeriodComponentTotals,
} from "@saas/db";
import {
  readDateColumn,
  readFteColumn,
  readDimensionValue,
  isSnapshotField,
  type SnapshotField,
  type ColumnProblem,
} from "@saas/payroll-core";

interface Mapping {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
  /**
   * Step 9. Optional on purpose: a mapping saved before migration 0010 has
   * neither, and must keep processing exactly as it did.
   */
  snapshotField?: string | null;
  dimensionName?: string | null;
}

/** What a column's values could not be read as. Surfaced, never swallowed. */
export interface ColumnIssue {
  sourceColumn: string;
  /** The snapshot field or dimension the column was mapped to. */
  target: string;
  problem: ColumnProblem;
}

interface ProcessInput {
  rows: Record<string, unknown>[];
  mappings: Mapping[];
  companyId: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  filename: string;
  uploadSessionId?: string;
  /**
   * The client to write through. Defaults to the module client via
   * `requireDb()`; a caller inside tRPC passes `ctx.db` so the write is
   * testable against the PGlite harness without `DATABASE_URL` being set.
   */
  db?: DbClient;
}

interface ProcessResult {
  periodId: string;
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  /**
   * Step 9: columns that were mapped but could not be read — an ambiguous date
   * order, an FTE column that is really a percentage. The import went ahead
   * without those values; this is what the caller shows so the admin knows a
   * column they mapped is not in the data.
   */
  columnIssues: ColumnIssue[];
}

export async function processUpload(input: ProcessInput): Promise<ProcessResult> {
  const db = input.db ?? requireDb();
  const empIdMapping = input.mappings.find((m) => m.isEmployeeId);
  const empNameMapping = input.mappings.find((m) => m.isEmployeeName);
  const deptMapping = input.mappings.find((m) => m.isDepartment);
  const grossMapping = input.mappings.find((m) => m.isGrossSalary);
  const netMapping = input.mappings.find((m) => m.isNetSalary);

  // Step 9: a column feeding a snapshot field or a dimension is not a pay
  // component. Without this it would land in `components` and be classified,
  // which for a hire date means a date string summed as money.
  const fieldMappings = new Map<SnapshotField, Mapping>();
  const dimensionMappings: { name: string; mapping: Mapping }[] = [];
  for (const m of input.mappings) {
    if (isSnapshotField(m.snapshotField)) {
      // First mapping wins, so two columns claiming one field cannot make the
      // result depend on row order.
      if (!fieldMappings.has(m.snapshotField)) fieldMappings.set(m.snapshotField, m);
    } else if (m.dimensionName && m.dimensionName.trim().length > 0) {
      dimensionMappings.push({ name: m.dimensionName.trim(), mapping: m });
    }
  }

  const componentMappings = input.mappings.filter(
    (m) =>
      !m.isEmployeeId &&
      !m.isEmployeeName &&
      !m.isDepartment &&
      !m.isGrossSalary &&
      !m.isNetSalary &&
      !isSnapshotField(m.snapshotField) &&
      !(m.dimensionName && m.dimensionName.trim().length > 0),
  );

  const columnIssues: ColumnIssue[] = [];

  /**
   * Read column-at-a-time, not row-at-a-time. The date order is a property of
   * the column — one `25/12/2025` settles every other value in it — so a
   * per-row reader could not infer it at all.
   */
  function column(mapping: Mapping): unknown[] {
    return input.rows.map((row) => row[mapping.sourceColumn]);
  }

  function collect(mapping: Mapping, target: string, problems: readonly ColumnProblem[]): void {
    for (const problem of problems) {
      columnIssues.push({ sourceColumn: mapping.sourceColumn, target, problem });
    }
  }

  function datesFor(field: Extract<SnapshotField, "hire_date" | "termination_date">) {
    const mapping = fieldMappings.get(field);
    if (!mapping) return null;
    const reading = readDateColumn(column(mapping));
    collect(mapping, field, reading.problems);
    return reading.values;
  }

  const hireDates = datesFor("hire_date");
  const terminationDates = datesFor("termination_date");

  /**
   * `employee_snapshots_dates_ordered` rejects a termination before a hire, and
   * the insert is one statement — so one corrupt row would roll back the whole
   * import. Drop the termination date on those rows and report them instead: a
   * register with two bad dates in three hundred should still import, and the
   * admin should still hear about them.
   */
  if (hireDates && terminationDates) {
    const reversed: string[] = [];
    for (const [index, hire] of hireDates.entries()) {
      const termination = terminationDates[index];
      if (hire && termination && termination < hire) {
        reversed.push(`${hire} → ${termination}`);
        terminationDates[index] = null;
      }
    }
    const terminationMapping = fieldMappings.get("termination_date");
    if (reversed.length > 0 && terminationMapping) {
      collect(terminationMapping, "termination_date", [
        { code: "unreadable_values", samples: reversed.slice(0, 3) },
      ]);
    }
  }

  const fteMapping = fieldMappings.get("fte");
  let fteValues: (number | null)[] | null = null;
  if (fteMapping) {
    const reading = readFteColumn(column(fteMapping));
    collect(fteMapping, "fte", reading.problems);
    fteValues = reading.values;
  }

  let totalGross = 0;
  let totalNet = 0;

  const snapshots = input.rows.map((row, index) => {
    const components: Record<string, number | null> = {};
    for (const m of componentMappings) {
      const val = row[m.sourceColumn];
      components[m.mappedComponent] = val !== null && val !== undefined ? Number(val) || 0 : null;
    }

    const dimensions: Record<string, string> = {};
    for (const { name, mapping } of dimensionMappings) {
      const value = readDimensionValue(row[mapping.sourceColumn]);
      // A blank cell leaves the key out rather than storing "", so a query for
      // "rows with a cost centre" means what it says.
      if (value !== null) dimensions[name] = value;
    }

    const gross = grossMapping ? Number(row[grossMapping.sourceColumn]) || 0 : 0;
    const net = netMapping ? Number(row[netMapping.sourceColumn]) || 0 : 0;
    totalGross += gross;
    totalNet += net;

    const fte = fteValues?.[index] ?? null;

    return {
      employeeExternalId: empIdMapping ? String(row[empIdMapping.sourceColumn] ?? "") : "",
      employeeName: empNameMapping ? String(row[empNameMapping.sourceColumn] ?? "") : "",
      department: deptMapping ? String(row[deptMapping.sourceColumn] ?? "") : null,
      components,
      grossSalary: String(gross),
      netSalary: String(net),
      currencyCode: input.currencyCode,
      hireDate: hireDates?.[index] ?? null,
      terminationDate: terminationDates?.[index] ?? null,
      // numeric, so drizzle wants a string; null stays null.
      fte: fte === null ? null : String(fte),
      dimensions,
    };
  });

  const [period] = await db.insert(payrollPeriods).values({
    companyId: input.companyId,
    periodType: input.periodType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    sourceFilename: input.filename,
    currencyCode: input.currencyCode,
    status: "processing",
    totalEmployees: snapshots.length,
    totalGross: String(totalGross),
    totalNet: String(totalNet),
    source: "upload",
  }).returning();

  // Everything after the period row is wrapped, because neon-http has no
  // interactive transaction to roll back for us. Without this, a failure in any
  // later step left the period behind as `processing` with a full set of
  // snapshots attached — invisible to the annual queries, permanently
  // "Processing" on the periods page, and one more orphan for every retry.
  // Observed for real when a deploy ran ahead of its migrations and
  // `period_component_totals` did not exist yet.
  try {
    await db.insert(employeeSnapshots).values(
      snapshots.map((s) => ({
        ...s,
        payrollPeriodId: period.id,
        grossSalary: String(s.grossSalary),
        netSalary: String(s.netSalary),
      })),
    );

    // Step 31: build the per-period aggregates now, while the data is hot, so
    // the annual dashboard never has to unnest the components JSON at read
    // time. Deliberately before the period is marked ready: the annual queries
    // only consider ready periods, so this ordering means a period is never
    // visible without its aggregates.
    await rebuildPeriodComponentTotals(db, period.id);

    await db.update(payrollPeriods)
      .set({ status: "ready" })
      .where(eq(payrollPeriods.id, period.id));
  } catch (cause) {
    // `employee_snapshots` and `period_component_totals` both cascade from the
    // period, so one delete undoes the whole partial import.
    try {
      await db.delete(payrollPeriods).where(eq(payrollPeriods.id, period.id));
    } catch (cleanupFailure) {
      console.error(
        `processUpload: could not roll back period ${period.id} after a failed import:`,
        cleanupFailure,
      );
    }
    throw cause;
  }

  if (input.uploadSessionId) {
    await db.update(uploadSessions)
      .set({ status: "ready" })
      .where(eq(uploadSessions.id, input.uploadSessionId));
  }

  return {
    periodId: period.id,
    employeeCount: snapshots.length,
    totalGross,
    totalNet,
    columnIssues,
  };
}
