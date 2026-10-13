/**
 * Generates twelve monthly payroll CSVs for 2025 for a ~150-person company,
 * as upload fixtures for the annual dashboard.
 *
 *   pnpm samples:annual-2025            # writes to <repo root>/samples/2025
 *   pnpm samples:annual-2025 -- <dir>   # or somewhere else
 *
 * Deterministic: a seeded PRNG, so re-running produces byte-identical files and
 * a bug found against them stays reproducible. Changing the seed, the headcount
 * curve or any rate below rewrites all twelve files.
 *
 * Column names are chosen against two real constraints, both verified rather
 * than assumed:
 *
 * - The identifier headers are exactly what the upload modal auto-maps
 *   ("Employee ID", "Full Name", "Department", "Gross Salary", "Net Salary").
 *   Rename them and the importer needs manual mapping.
 * - The component headers were checked against `classifyComponentWithReason`
 *   so each lands in the intended Category instead of `uncategorised`.
 *
 * "Expense Reimbursement" is the deliberate exception: the classifier does not
 * recognise it (nor "Expense Refund"), so it stays uncategorised. That is the
 * point — it raises the data-quality warning and shows up in the
 * `other_earnings_balance` line, which exists precisely because real uploads
 * carry columns nobody has mapped. Recategorising it in the UI takes that
 * balance to zero.
 *
 * Arithmetic is internally consistent, so the dashboard's bridge closes to
 * exactly zero:
 *
 *   Gross = base + allowances + bonuses + commission + overtime + expenses
 *   Net   = Gross - income tax - employee social security - loan - unpaid leave
 *
 * Employer costs sit on top of gross, never inside it. Deductions are written
 * as positive numbers, matching samples/payroll_june_2026.csv.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_OUT = resolve(__dirname, "../../../../samples/2025");
const OUT = process.argv[2] ?? DEFAULT_OUT;

/** mulberry32 — small, fast, deterministic. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20250101);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const chance = (p: number) => rand() < p;
const money = (n: number) => Math.round(n * 100) / 100;

const FIRST = [
  "Alice", "Bob", "Carol", "David", "Eve", "Frank", "Grace", "Henry", "Ivy", "Jack",
  "Karen", "Leo", "Maria", "Nathan", "Olivia", "Paul", "Quinn", "Rachel", "Sam", "Tina",
  "Omar", "Layla", "Yusuf", "Nadia", "Karim", "Rania", "Tarek", "Hiba", "Samir", "Dalia",
  "Marco", "Elena", "Pierre", "Sophie", "Lukas", "Anna", "Diego", "Carmen", "Niels", "Freya",
  "Arun", "Priya", "Chen", "Mei", "Hiro", "Yuki", "Kwame", "Amara", "Sven", "Ingrid",
];
const LAST = [
  "Johnson", "Smith", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor",
  "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia",
  "Martinez", "Robinson", "Clark", "Haddad", "Khoury", "Nasser", "Aziz", "Mansour",
  "Rossi", "Dubois", "Mueller", "Novak", "Larsen", "Patel", "Nguyen", "Okafor", "Silva",
  "Kowalski", "Fernandez", "Yamamoto", "Eriksen", "Bergman", "Costa",
];

interface Band {
  name: string;
  base: [number, number];
  transport: number;
  health: number;
}
const BANDS: Band[] = [
  { name: "junior", base: [3200, 4800], transport: 200, health: 180 },
  { name: "mid", base: [5200, 7800], transport: 300, health: 240 },
  { name: "senior", base: [8500, 12500], transport: 400, health: 320 },
  { name: "lead", base: [13500, 19000], transport: 500, health: 420 },
];

const DEPARTMENTS = [
  { name: "Engineering", weight: 32, bands: [0, 1, 2, 2, 3] },
  { name: "Sales", weight: 22, bands: [0, 1, 1, 2, 3] },
  { name: "Support", weight: 14, bands: [0, 0, 1, 1] },
  { name: "Operations", weight: 12, bands: [0, 0, 1, 1, 2] },
  { name: "Marketing", weight: 9, bands: [0, 1, 1, 2] },
  { name: "Finance", weight: 6, bands: [1, 1, 2, 3] },
  { name: "Design", weight: 5, bands: [0, 1, 2] },
  { name: "HR", weight: 4, bands: [0, 1, 2] },
];

/**
 * The year's story, as a headcount per month: growth through H1, a
 * restructuring in August, then measured recovery.
 */
const HEADCOUNT = [132, 136, 141, 147, 152, 158, 157, 143, 146, 149, 151, 151];

interface Employee {
  id: string;
  name: string;
  department: string;
  band: Band;
  base: number;
  startMonth: number;
  endMonth: number | null;
  hasLoan: boolean;
  loan: number;
}

const roster: Employee[] = [];
let nextId = 1;
const usedNames = new Set<string>();

function newEmployee(startMonth: number): Employee {
  const total = DEPARTMENTS.reduce((s, d) => s + d.weight, 0);
  let roll = rand() * total;
  let dept = DEPARTMENTS[0]!;
  for (const d of DEPARTMENTS) {
    roll -= d.weight;
    if (roll <= 0) {
      dept = d;
      break;
    }
  }
  const band = BANDS[pick(dept.bands)]!;

  let name = `${pick(FIRST)} ${pick(LAST)}`;
  let guard = 0;
  while (usedNames.has(name) && guard++ < 200) name = `${pick(FIRST)} ${pick(LAST)}`;
  usedNames.add(name);

  const hasLoan = chance(0.06);
  return {
    id: `E${String(nextId++).padStart(4, "0")}`,
    name,
    department: dept.name,
    band,
    base: money(between(band.base[0], band.base[1])),
    startMonth,
    endMonth: null,
    hasLoan,
    loan: hasLoan ? money(between(300, 900)) : 0,
  };
}

// January's opening roster.
for (let i = 0; i < HEADCOUNT[0]!; i++) roster.push(newEmployee(1));

for (let m = 2; m <= 12; m++) {
  const active = roster.filter((e) => e.startMonth <= m && (e.endMonth === null || e.endMonth >= m));
  const target = HEADCOUNT[m - 1]!;
  const delta = target - active.length;

  // Ordinary attrition runs alongside growth, so months that grow still show
  // leavers — otherwise turnover reads as zero all year.
  const attrition = m === 8 ? 0 : Math.round(between(0, 2.6));
  const leavers = delta < 0 ? -delta + 2 : attrition;

  const candidates = active
    .filter((e) => e.startMonth < m - 1)
    // The August restructuring is concentrated in Operations and Support.
    .sort((a, b) => {
      if (m === 8) {
        const hit = (d: string) => (d === "Operations" || d === "Support" ? 0 : 1);
        const diff = hit(a.department) - hit(b.department);
        if (diff !== 0) return diff;
      }
      return rand() - 0.5;
    });

  for (let i = 0; i < Math.min(leavers, candidates.length); i++) {
    candidates[i]!.endMonth = m - 1;
  }

  const stillActive = roster.filter(
    (e) => e.startMonth <= m && (e.endMonth === null || e.endMonth >= m),
  ).length;
  for (let i = 0; i < target - stillActive; i++) roster.push(newEmployee(m));
}

/** July merit review: everyone hired before June gets a rise. */
const REVIEW_MONTH = 7;
const REVIEW_PCT = 0.042;

function baseFor(e: Employee, month: number): number {
  return month >= REVIEW_MONTH && e.startMonth < 6 ? money(e.base * (1 + REVIEW_PCT)) : e.base;
}

/** Overtime: a low baseline, a launch spike in Mar-Apr, peak season in Nov. */
function overtime(e: Employee, month: number): { hours: number; pay: number } {
  const launch = (month === 3 || month === 4) && ["Engineering", "Support"].includes(e.department);
  const peak = month === 11 && ["Sales", "Operations", "Support"].includes(e.department);
  const yearEnd = month === 12 && e.department === "Operations";

  let p = 0.08;
  let lo = 4;
  let hi = 12;
  if (launch) { p = 0.45; lo = 15; hi = 40; }
  else if (peak) { p = 0.55; lo = 20; hi = 45; }
  else if (yearEnd) { p = 0.3; lo = 10; hi = 28; }

  if (!chance(p)) return { hours: 0, pay: 0 };
  const hours = Math.round(between(lo, hi) * 2) / 2;
  const hourly = baseFor(e, month) / 173;
  return { hours, pay: money(hours * hourly * 1.5) };
}

/** Absence: winter sickness, a summer holiday peak, a December wind-down. */
function absenceDays(month: number): number {
  const summer = month === 7 || month === 8;
  const winter = month === 1 || month === 2;
  const december = month === 12;

  let p = 0.18;
  let lo = 0.5;
  let hi = 2;
  if (summer) { p = 0.62; lo = 5; hi = 12; }
  else if (winter) { p = 0.28; lo = 1; hi = 3.5; }
  else if (december) { p = 0.45; lo = 3; hi = 8; }

  if (!chance(p)) return 0;
  return Math.round(between(lo, hi) * 2) / 2;
}

/** Expense refunds: conference season in Q1, quiet over summer, busy in Q4. */
function expenses(e: Employee, month: number): number {
  const travellers = ["Sales", "Marketing", "Engineering", "Operations"];
  if (!travellers.includes(e.department)) return chance(0.05) ? money(between(60, 240)) : 0;

  let p: number;
  let lo: number;
  let hi: number;
  if (month <= 3) { p = 0.3; lo = 200; hi = 1800; }
  else if (month <= 6) { p = 0.2; lo = 150; hi = 900; }
  else if (month <= 8) { p = 0.08; lo = 100; hi = 400; }
  else { p = 0.35; lo = 250; hi = 2200; }

  return chance(p) ? money(between(lo, hi)) : 0;
}

/** Mildly progressive, so the effective rate moves with the bonus months. */
function incomeTax(gross: number): number {
  if (gross <= 4000) return money(gross * 0.11);
  if (gross <= 9000) return money(400 + (gross - 4000) * 0.17);
  if (gross <= 16000) return money(1250 + (gross - 9000) * 0.22);
  return money(2790 + (gross - 16000) * 0.26);
}

const HEADERS = [
  "Employee ID", "Full Name", "Department",
  "Base Salary", "Housing Allowance", "Transport Allowance", "Meal Allowance",
  "Performance Bonus", "Sales Commission", "Overtime Pay", "Expense Reimbursement",
  "Overtime Hours", "Absence Days",
  "Income Tax", "Social Security Employee", "Loan Repayment", "Unpaid Leave Deduction",
  "Social Security Employer", "Health Insurance Employer",
  "Gross Salary", "Net Salary",
];

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

mkdirSync(OUT, { recursive: true });
const report: string[] = [];

for (let month = 1; month <= 12; month++) {
  const active = roster.filter(
    (e) => e.startMonth <= month && (e.endMonth === null || e.endMonth >= month),
  );

  const rows: string[] = [HEADERS.join(",")];
  let totGross = 0;
  let totNet = 0;
  let totOtHours = 0;
  let totAbsence = 0;
  let totExpense = 0;

  for (const e of active) {
    const base = baseFor(e, month);
    const housing = money(base * 0.18);
    const transport = e.band.transport;
    const meal = 150;

    const bonusEligible = e.startMonth <= month - 2;
    const perfBonus =
      month === 3 && bonusEligible && chance(0.7) ? money(base * between(0.6, 1.1))
      : month === 12 && bonusEligible && chance(0.6) ? money(base * between(0.3, 0.7))
      : 0;

    let commission = 0;
    if (e.department === "Sales") {
      const season = month === 11 || month === 12 ? 1.8 : month <= 2 ? 0.6 : 1;
      commission = money(between(500, 6000) * season);
    }

    const ot = overtime(e, month);
    const expense = expenses(e, month);
    const absence = absenceDays(month);

    const unpaidDays = chance(0.03) ? Math.round(between(1, 4) * 2) / 2 : 0;
    const unpaid = unpaidDays > 0 ? money((base / 22) * unpaidDays) : 0;

    const gross = money(base + housing + transport + meal + perfBonus + commission + ot.pay + expense);
    const tax = incomeTax(gross);
    const ssEmployee = money(Math.min(base, 15000) * 0.075);
    const loan = e.hasLoan ? e.loan : 0;
    const net = money(gross - tax - ssEmployee - loan - unpaid);

    const ssEmployer = money(base * 0.115);
    const health = e.band.health;

    totGross += gross;
    totNet += net;
    totOtHours += ot.hours;
    totAbsence += absence;
    totExpense += expense;

    rows.push([
      e.id, e.name, e.department,
      base, housing, transport, meal,
      perfBonus, commission, ot.pay, expense,
      ot.hours, absence,
      tax, ssEmployee, loan, unpaid,
      ssEmployer, health,
      gross, net,
    ].join(","));
  }

  const mm = String(month).padStart(2, "0");
  const file = `payroll_2025_${mm}_${MONTH_NAMES[month - 1]}.csv`;
  writeFileSync(join(OUT, file), rows.join("\n") + "\n", "utf8");

  const joiners = active.filter((e) => e.startMonth === month).length;
  const leavers = roster.filter((e) => e.endMonth === month).length;
  report.push(
    `${mm}  headcount ${String(active.length).padStart(3)}  +${String(joiners).padStart(2)} -${String(leavers).padStart(2)}  ` +
    `gross ${totGross.toFixed(0).padStart(9)}  net ${totNet.toFixed(0).padStart(9)}  ` +
    `OT ${totOtHours.toFixed(0).padStart(5)}h  absence ${totAbsence.toFixed(1).padStart(6)}d  ` +
    `expenses ${totExpense.toFixed(0).padStart(7)}`,
  );
}

console.log(report.join("\n"));
console.log(`\nroster size across the year: ${roster.length}`);
console.log(`files written to: ${OUT}`);
