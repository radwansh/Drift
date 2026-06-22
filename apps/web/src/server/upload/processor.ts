import { requireDb } from "@saas/db";
import { eq } from "drizzle-orm";
import { payrollPeriods, employeeSnapshots, uploadSessions } from "@saas/db";

interface Mapping {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
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
}

interface ProcessResult {
  periodId: string;
  employeeCount: number;
  totalGross: number;
  totalNet: number;
}

export async function processUpload(input: ProcessInput): Promise<ProcessResult> {
  const empIdMapping = input.mappings.find((m) => m.isEmployeeId);
  const empNameMapping = input.mappings.find((m) => m.isEmployeeName);
  const deptMapping = input.mappings.find((m) => m.isDepartment);
  const grossMapping = input.mappings.find((m) => m.isGrossSalary);
  const netMapping = input.mappings.find((m) => m.isNetSalary);
  const componentMappings = input.mappings.filter(
    (m) =>
      !m.isEmployeeId &&
      !m.isEmployeeName &&
      !m.isDepartment &&
      !m.isGrossSalary &&
      !m.isNetSalary,
  );

  let totalGross = 0;
  let totalNet = 0;

  const snapshots = input.rows.map((row) => {
    const components: Record<string, number | null> = {};
    for (const m of componentMappings) {
      const val = row[m.sourceColumn];
      components[m.mappedComponent] = val !== null && val !== undefined ? Number(val) || 0 : null;
    }

    const gross = grossMapping ? Number(row[grossMapping.sourceColumn]) || 0 : 0;
    const net = netMapping ? Number(row[netMapping.sourceColumn]) || 0 : 0;
    totalGross += gross;
    totalNet += net;

    return {
      employeeExternalId: empIdMapping ? String(row[empIdMapping.sourceColumn] ?? "") : "",
      employeeName: empNameMapping ? String(row[empNameMapping.sourceColumn] ?? "") : "",
      department: deptMapping ? String(row[deptMapping.sourceColumn] ?? "") : null,
      components,
      grossSalary: String(gross),
      netSalary: String(net),
      currencyCode: input.currencyCode,
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

  await db.insert(employeeSnapshots).values(
    snapshots.map((s) => ({
      ...s,
      payrollPeriodId: period.id,
      grossSalary: String(s.grossSalary),
      netSalary: String(s.netSalary),
    })),
  );

  await db.update(payrollPeriods)
    .set({ status: "ready" })
    .where(eq(payrollPeriods.id, period.id));

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
  };
}
