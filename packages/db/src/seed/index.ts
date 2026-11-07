import { eq } from "drizzle-orm";
import { requireDb } from "../client";
import { companies } from "../schema/companies";
import { users } from "../schema/users";
import { payrollPeriods } from "../schema/payrollPeriods";
import { employeeSnapshots } from "../schema/employeeSnapshots";
import { companies as demoCompanies, generateComponentValue, type DemoCompany, type EmployeeSnapshot } from "./demo-data";

/**
 * Hosts this script will write to without being told twice.
 *
 * Neon's hostnames all end in `.neon.tech`, so anything not on this list is
 * assumed to be a database somebody else can see.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

/**
 * Refuse to seed a database that is not local, unless `ALLOW_SEED=1`.
 *
 * This script inserts three fictional companies with admin users and four
 * months of payroll each. Run once against the wrong `DATABASE_URL`, that is
 * exactly what happened: Acme Corp, GlobalTech Ltd and EuroSoft GmbH sat in the
 * shared preview/development database for five months, and were only found when
 * somebody went looking for something else.
 *
 * The repo-root `.env` this reads is the same file a developer points at a
 * deployed database to run a migration or inspect something, so "check what
 * DATABASE_URL resolves to first" is a rule that depends on remembering. This
 * does not. It prints the host either way, so the answer is on screen before
 * anything is written rather than in a file somebody has to go and open.
 *
 * `ci.yml` separately forbids any workflow from calling this script, but that
 * check greps workflow files — it cannot see a laptop, which is where the
 * damage was actually done.
 */
function assertSafeToSeed(): void {
  const url = process.env.DATABASE_URL;
  if (!url) return; // requireDb() below reports a missing URL better than this can.

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error("DATABASE_URL is not a URL this script can read. Refusing to seed.");
    process.exit(1);
  }

  const local = LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
  console.log(`Seed target: ${host}${local ? " (local)" : ""}`);

  if (local || process.env.ALLOW_SEED === "1") return;

  console.error(`Refusing to seed ${host}: it is not a local database.`);
  console.error("This writes three demo companies and four months of payroll each.");
  console.error("If that is genuinely what you want here, re-run with ALLOW_SEED=1.");
  process.exit(1);
}

async function seed() {
  assertSafeToSeed();
  const db = requireDb();
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
    if (!company) throw new Error(`Failed to create company ${demo.slug}`);
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
    if (!admin) throw new Error(`Failed to create admin for ${demo.slug}`);
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
          status: "completed",
        })
        .returning();
      if (!period) throw new Error(`Failed to create period ${periodStart} for ${demo.slug}`);
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
    const department = departments[idx % departments.length] ?? "Unassigned";

    const componentsRecord: Record<string, string> = {};
    let grossSalary = 0;
    let totalDeductions = 0;

    for (const comp of earningComponents) {
      const range = componentRange[comp.name];
      if (!range) continue;
      const val = generateComponentValue(comp.name, range);
      componentsRecord[comp.name] = val;
      grossSalary += parseFloat(val);
    }

    for (const comp of deductionComponents) {
      const range = componentRange[comp.name];
      if (!range) continue;
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
