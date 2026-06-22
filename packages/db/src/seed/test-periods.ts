import { requireDb } from "../client";
import { companies } from "../schema/companies";
import { users } from "../schema/users";
import { payrollPeriods } from "../schema/payrollPeriods";
import { employeeSnapshots } from "../schema/employeeSnapshots";
import { eq } from "drizzle-orm";
import { companies as demoCompanies } from "./demo-data";

async function seedTestPeriods() {
  const db = requireDb();
  console.log("Seeding test periods (June & July 2026)...");

  const demo = demoCompanies[0];
  const [company] = await db
    .insert(companies)
    .values({
      name: demo.name,
      slug: demo.slug,
      currencyCode: demo.currencyCode,
      settings: { employeeCount: demo.employeeNames.length },
    })
    .onConflictDoNothing()
    .returning();

  const companyId = company?.id ?? (
    await db.query.companies.findFirst({ where: eq(companies.slug, demo.slug) })
  )!.id;

  const [admin] = await db
    .insert(users)
    .values({
      companyId,
      email: `admin@${demo.slug}.com`,
      name: `Admin (${demo.name})`,
      role: "admin",
      clerkUserId: `clerk_${demo.slug}_admin`,
    })
    .onConflictDoNothing()
    .returning();
  if (admin) console.log(`  Admin: ${admin.email}`);

  const periods = [
    { start: "2026-06-01", end: "2026-06-30", label: "June 2026" },
    { start: "2026-07-01", end: "2026-07-31", label: "July 2026" },
  ];

  for (const { start, end, label } of periods) {
    const [period] = await db
      .insert(payrollPeriods)
      .values({
        companyId,
        periodType: "monthly",
        periodStart: start,
        periodEnd: end,
        currencyCode: demo.currencyCode,
        status: "ready",
        totalEmployees: demo.employeeNames.length,
        source: "upload",
        sourceFilename: `payroll_${label.replace(" ", "_")}.csv`,
      })
      .returning();
    console.log(`  Period: ${label}`);

    const snapshots = demo.employeeNames.map((name, idx) => {
      const dept = demo.departments[idx % demo.departments.length];
      const base = 3000 + Math.random() * 9000;
      const housing = 800 + Math.random() * 1700;
      const transport = 200 + Math.random() * 400;
      const bonus = Math.random() * 3000;
      const tax = 500 + Math.random() * 3000;
      const insurance = 100 + Math.random() * 400;
      const gross = base + housing + transport + bonus;
      const net = gross - tax - insurance;

      return {
        employeeExternalId: `EMP-${String(idx + 1).padStart(4, "0")}`,
        employeeName: name,
        department: dept,
        components: {
          "Base Salary": base.toFixed(2),
          "Housing Allowance": housing.toFixed(2),
          "Transport Allowance": transport.toFixed(2),
          Bonus: bonus.toFixed(2),
          "Tax Deduction": tax.toFixed(2),
          "Insurance Deduction": insurance.toFixed(2),
          "Gross Salary": gross.toFixed(2),
          "Net Salary": net.toFixed(2),
        },
        grossSalary: gross.toFixed(2),
        netSalary: net.toFixed(2),
        currencyCode: demo.currencyCode,
      };
    });

    const totalGross = snapshots.reduce((s, snap) => s + parseFloat(snap.grossSalary), 0);
    const totalNet = snapshots.reduce((s, snap) => s + parseFloat(snap.netSalary), 0);

    await db.update(payrollPeriods)
      .set({
        totalEmployees: snapshots.length,
        totalGross: totalGross.toFixed(2),
        totalNet: totalNet.toFixed(2),
      })
      .where(eq(payrollPeriods.id, period.id));

    await db.insert(employeeSnapshots).values(
      snapshots.map((s) => ({ ...s, payrollPeriodId: period.id })),
    );

    console.log(`    ${snapshots.length} employee snapshots created`);
  }

  console.log("Test periods seeded successfully!");
}

seedTestPeriods().catch((e) => {
  console.error(e);
  process.exit(1);
});
