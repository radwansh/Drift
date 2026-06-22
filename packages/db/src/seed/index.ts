import { eq } from "drizzle-orm";
import { db } from "../client";
import { companies } from "../schema/companies";
import { users } from "../schema/users";
import { payrollPeriods } from "../schema/payrollPeriods";
import { employeeSnapshots } from "../schema/employeeSnapshots";
import { companies as demoCompanies, generateComponentValue, type DemoCompany, type EmployeeSnapshot } from "./demo-data";

async function seed() {
  console.log("Seeding database...");

  for (const demo of demoCompanies) {
    const [company] = await db
      .insert(companies)
      .values({
        name: demo.name,
        slug: demo.slug,
        currencyCode: demo.currencyCode,
        settings: { employeeCount: demo.employeeNames.length },
      })
      .returning();
    console.log(`Created company: ${company.name} (${company.id})`);

    const [admin] = await db
      .insert(users)
      .values({
        companyId: company.id,
        email: `admin@${demo.slug}.com`,
        name: `Admin (${demo.name})`,
        role: "admin",
        clerkUserId: `clerk_${demo.slug}_admin`,
      })
      .returning();
    console.log(`  Admin: ${admin.email}`);

    for (let month = 0; month < 4; month++) {
      const periodStart = `2026-${String(month + 1).padStart(2, "0")}-01`;
      const periodEnd = month === 1
        ? "2026-02-28"
        : `2026-${String(month + 1).padStart(2, "0")}-${new Date(2026, month + 1, 0).getDate()}`;

      const [period] = await db
        .insert(payrollPeriods)
        .values({
          companyId: company.id,
          periodType: "monthly",
          periodStart,
          periodEnd,
          currencyCode: demo.currencyCode,
          status: "ready",
        })
        .returning();
      console.log(`  Period: ${periodStart} - ${periodEnd}`);

      const snapshots: EmployeeSnapshot[] = generateSnapshotsForPeriod(demo, month);
      const totalGross = snapshots.reduce((sum, s) => sum + parseFloat(s.grossSalary), 0);
      const totalNet = snapshots.reduce((sum, s) => sum + parseFloat(s.netSalary), 0);

      await db.update(payrollPeriods).set({
        totalEmployees: snapshots.length,
        totalGross: totalGross.toFixed(2),
        totalNet: totalNet.toFixed(2),
      }).where(eq(payrollPeriods.id, period.id));

      for (const snap of snapshots) {
        await db.insert(employeeSnapshots).values({
          payrollPeriodId: period.id,
          ...snap,
        });
      }
      console.log(`    ${snapshots.length} employee snapshots created`);
    }
  }

  console.log("Seeding complete!");
}

function generateSnapshotsForPeriod(demo: DemoCompany, monthIndex: number): EmployeeSnapshot[] {
  const { employeeNames, departments, components, componentRange } = demo;
  const earningComponents = components.filter((c) => c.type === "earning");
  const deductionComponents = components.filter((c) => c.type === "deduction");

  let pool: string[];
  if (monthIndex === 0) {
    pool = employeeNames.slice(0, Math.floor(employeeNames.length * 0.9));
  } else if (monthIndex === 1) {
    pool = employeeNames.slice(2);
  } else if (monthIndex === 2) {
    const active = employeeNames.slice(2);
    const newHires = employeeNames.slice(0, 2);
    pool = [...active.slice(0, active.length - 2), ...newHires];
  } else {
    pool = employeeNames.slice(0, employeeNames.length - 1);
  }

  return pool.map((name, idx) => {
    const employeeExternalId = `EMP-${String(idx + 1).padStart(4, "0")}`;
    const department = departments[idx % departments.length];

    const componentsRecord: Record<string, string> = {};
    let grossSalary = 0;
    let totalDeductions = 0;

    for (const comp of earningComponents) {
      const range = componentRange[comp.name];
      const val = generateComponentValue(comp.name, range);
      componentsRecord[comp.name] = val;
      grossSalary += parseFloat(val);
    }

    for (const comp of deductionComponents) {
      const range = componentRange[comp.name];
      const val = generateComponentValue(comp.name, range);
      componentsRecord[comp.name] = val;
      totalDeductions += parseFloat(val);
    }

    const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;
    componentsRecord["Net Salary"] = netSalary.toFixed(2);
    componentsRecord["Gross Salary"] = grossSalary.toFixed(2);

    return {
      employeeExternalId,
      employeeName: name,
      department,
      components: componentsRecord,
      grossSalary: grossSalary.toFixed(2),
      netSalary: netSalary.toFixed(2),
      currencyCode: demo.currencyCode,
    };
  });
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
