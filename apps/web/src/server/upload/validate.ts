import {
  reconcileRegister,
  checkControlTotals,
  describeBreach,
  minorUnits,
  isSnapshotField,
  type ReconcileRow,
  type ReconciliationReport,
  type ControlTotals,
  type ControlTotalCheck,
} from "@saas/payroll-core";

interface Mapping {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
  /** Step 9: a column recorded as a date, an FTE or a dimension is not money. */
  snapshotField?: string | null;
  dimensionName?: string | null;
}

interface ValidationError {
  row?: number;
  column?: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  valid: boolean;
  totalRows: number;
  errors: ValidationError[];
  warnings: ValidationError[];
  totalGross: number;
  totalNet: number;
  employeeCount: number;
  detectedCurrency: string | null;
  /**
   * Step 4: the reconciliation, for the wizard's Data check panel. Present
   * whenever both a gross and a net column are mapped; `null` when they are
   * not, because neither identity can be stated without them.
   */
  reconciliation: ReconciliationReport | null;
  /** Lines where the admin's stated total disagrees with the computed one. */
  controlTotals: ControlTotalCheck[];
  /** Which control lines the admin left blank. Absence is not agreement. */
  controlTotalsMissing: ("gross" | "net")[];
}

export interface ValidateOptions {
  /** The currency's minor units decide the tolerance. Defaults to 2. */
  currencyCode?: string | null;
  /** What the admin says the register's own export totalled. */
  controlTotals?: ControlTotals;
}

export function validateRows(
  rows: Record<string, unknown>[],
  mappings: Mapping[],
  options: ValidateOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  /** First file row that held each employee ID, so a repeat can name its pair. */
  const employeeIdRows = new Map<string, number>();
  let totalGross = 0;
  let totalNet = 0;
  let employeeCount = 0;

  const empIdMapping = mappings.find((m) => m.isEmployeeId);
  const grossMapping = mappings.find((m) => m.isGrossSalary);
  const netMapping = mappings.find((m) => m.isNetSalary);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (empIdMapping) {
      const empId = row[empIdMapping.sourceColumn];
      if (empId === null || empId === undefined || String(empId).trim() === "") {
        errors.push({
          row: rowNum,
          column: empIdMapping.sourceColumn,
          message: "Missing employee ID",
          severity: "error",
        });
      } else {
        const idStr = String(empId).trim();
        const firstRow = employeeIdRows.get(idStr);
        if (firstRow !== undefined) {
          // An error, not a warning (step 2 of docs/PAYROLL_AUDIT_FIX_PLAN.md).
          // As a warning the upload completed and the period was marked
          // `ready` with both rows in it; the comparison then kept the first
          // row per ID and dropped the rest, so one person paid twice produced
          // a dashboard reading "no change" with no flag of any kind. The
          // register is what has to be corrected, so the gate is at the door.
          // The first row holding the ID is named because that is the pair the
          // payroll admin has to look at.
          errors.push({
            row: rowNum,
            column: empIdMapping.sourceColumn,
            message: `Duplicate employee ID ${idStr}: also on row ${firstRow}`,
            severity: "error",
          });
        } else {
          employeeIdRows.set(idStr, rowNum);
        }
      }
    }

    if (grossMapping) {
      const gross = row[grossMapping.sourceColumn];
      const grossNum = parseNumeric(gross);
      if (grossNum === null) {
        errors.push({
          row: rowNum,
          column: grossMapping.sourceColumn,
          message: "Invalid or missing gross salary value",
          severity: "error",
        });
      } else {
        totalGross += grossNum;
        if (grossNum < 0) {
          warnings.push({
            row: rowNum,
            column: grossMapping.sourceColumn,
            message: "Negative gross salary value",
            severity: "warning",
          });
        }
      }
    }

    if (netMapping) {
      const net = row[netMapping.sourceColumn];
      const netNum = parseNumeric(net);
      if (netNum === null) {
        errors.push({
          row: rowNum,
          column: netMapping.sourceColumn,
          message: "Invalid or missing net salary value",
          severity: "error",
        });
      } else {
        totalNet += netNum;
        if (netNum < 0) {
          warnings.push({
            row: rowNum,
            column: netMapping.sourceColumn,
            message: "Negative net salary value",
            severity: "warning",
          });
        }
      }
    }

    employeeCount++;
  }

  const currencyCandidates = new Set<string>();
  for (const row of rows) {
    for (const mapping of mappings) {
      if (mapping.mappedComponent === "currency" || mapping.sourceColumn.toLowerCase().includes("currency")) {
        const val = row[mapping.sourceColumn];
        if (val && typeof val === "string" && val.length === 3) {
          currencyCandidates.add(val.toUpperCase());
        }
      }
    }
  }

  const detectedCurrency =
    currencyCandidates.size === 1 ? (currencyCandidates.values().next().value ?? null) : null;

  /**
   * Step 4: the reconciliation gate.
   *
   * The two sums that define a correct register were computed nowhere, so
   * `samples/payroll_july_2026.csv` — 520.00 out across three rows — imported
   * cleanly, built a dashboard and had an AI narrative written about it.
   *
   * A breach is an **error**, which is what makes this a gate rather than a
   * report: `payrollPeriods.ingest` refuses on `valid: false`, so a failing
   * register never becomes a period at all, rather than becoming one that is
   * flagged afterwards. The tolerance is the currency's own minor unit, from
   * the register's detected currency where it has one.
   *
   * An unplaced column is a **warning**: "your register does not add up" and
   * "Clarivo does not know what this column is" are different problems, and
   * `samples/2025` carries such a column deliberately.
   */
  const decimals = minorUnits(detectedCurrency ?? options.currencyCode);
  const reconciliation =
    grossMapping && netMapping
      ? reconcileRegister({
          rows: reconcileRows(rows, mappings, grossMapping, netMapping),
          decimals,
          rowNumbers: employeeIdRows,
        })
      : null;

  if (reconciliation) {
    for (const breach of reconciliation.breaches) {
      errors.push({
        row: breach.row,
        message: describeBreach(breach, decimals),
        severity: "error",
      });
    }

    for (const column of reconciliation.mixedSignColumns) {
      // An error, not a warning: the rows it touches get no verdict on the net
      // identity, so passing the register would be passing something unchecked.
      errors.push({
        column: column.componentKey,
        message:
          `${column.componentKey} is written as a positive amount for ${column.positive.join(", ")} ` +
          `and a negative one for ${column.negative.join(", ")}. Use one sign throughout, ` +
          `so it is clear which rows it reduces.`,
        severity: "error",
      });
    }

    for (const column of reconciliation.unplacedColumns) {
      warnings.push({
        column: column.componentKey,
        message:
          `${column.componentKey} (${column.total.toFixed(decimals)}) is not a component Clarivo recognises, ` +
          `so it is counted toward gross but not categorised. Categorise it in Settings to place it.`,
        severity: "warning",
      });
    }
  }

  // The control total: what the admin ticks the register against. Clarivo's own
  // totals can only ever agree with themselves, so a line left blank means the
  // register was never checked against anything outside Clarivo — reported as
  // "not supplied" rather than treated as agreement.
  const stated = options.controlTotals ?? {};
  const controlTotals = checkControlTotals(stated, { gross: totalGross, net: totalNet }, decimals);
  const controlTotalsMissing = (["gross", "net"] as const).filter(
    (line) => stated[line] === null || stated[line] === undefined,
  );

  for (const check of controlTotals) {
    errors.push({
      message:
        `The ${check.line} control total you entered is ${check.stated.toFixed(decimals)}, ` +
        `but the rows add up to ${check.computed.toFixed(decimals)} — ` +
        `${check.difference > 0 ? "+" : ""}${check.difference.toFixed(decimals)}.`,
      severity: "error",
    });
  }

  return {
    valid: errors.length === 0,
    totalRows: rows.length,
    errors,
    warnings,
    totalGross,
    totalNet,
    employeeCount,
    detectedCurrency,
    reconciliation,
    controlTotals,
    controlTotalsMissing,
  };
}

/**
 * The rows in the shape `reconcileRegister` takes.
 *
 * Only money columns: the identity flags are not components, and step 9's
 * record roles are dates, an FTE or a dimension. A hire date reaching the
 * earnings side would be a nine-digit number in it.
 */
function reconcileRows(
  rows: Record<string, unknown>[],
  mappings: Mapping[],
  grossMapping: Mapping,
  netMapping: Mapping,
): ReconcileRow[] {
  const empIdMapping = mappings.find((m) => m.isEmployeeId);
  const componentMappings = mappings.filter(
    (m) =>
      !m.isEmployeeId &&
      !m.isEmployeeName &&
      !m.isDepartment &&
      !m.isGrossSalary &&
      !m.isNetSalary &&
      !isSnapshotField(m.snapshotField) &&
      !(m.dimensionName && m.dimensionName.trim().length > 0) &&
      m.mappedComponent !== "" &&
      m.mappedComponent !== "ignore",
  );

  return rows.map((row, i) => {
    const components: Record<string, number | null> = {};
    for (const m of componentMappings) {
      components[m.mappedComponent] = parseNumeric(row[m.sourceColumn]);
    }

    const rawId = empIdMapping ? row[empIdMapping.sourceColumn] : undefined;
    const employeeId =
      rawId === null || rawId === undefined || String(rawId).trim() === ""
        ? `row ${i + 2}`
        : String(rawId).trim();

    return {
      employeeId,
      gross: parseNumeric(row[grossMapping.sourceColumn]) ?? 0,
      net: parseNumeric(row[netMapping.sourceColumn]) ?? 0,
      components,
    };
  });
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const str = String(value).replace(/[,$\s]/g, "");
  const num = Number(str);
  return isNaN(num) ? null : num;
}
