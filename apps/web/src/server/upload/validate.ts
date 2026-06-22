interface Mapping {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
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
}

export function validateRows(
  rows: Record<string, unknown>[],
  mappings: Mapping[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const employeeIds = new Set<string>();
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
        if (employeeIds.has(idStr)) {
          warnings.push({
            row: rowNum,
            column: empIdMapping.sourceColumn,
            message: `Duplicate employee ID: ${idStr}`,
            severity: "warning",
          });
        }
        employeeIds.add(idStr);
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

  return {
    valid: errors.length === 0,
    totalRows: rows.length,
    errors,
    warnings,
    totalGross,
    totalNet,
    employeeCount,
    detectedCurrency: currencyCandidates.size === 1 ? currencyCandidates.values().next().value : null,
  };
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const str = String(value).replace(/[,$\s]/g, "");
  const num = Number(str);
  return isNaN(num) ? null : num;
}
