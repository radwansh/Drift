import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { sql, eq, and } from "drizzle-orm";
import { requireDb, users, payrollPeriods } from "@saas/db";
import { AnnualDashboard } from "@/components/annual/annual-dashboard";

export const dynamic = "force-dynamic";

const YEAR_COOKIE = "drift_annual_year";

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || !/^\d{4}$/.test(value)) return null;
  const currentYear = new Date().getFullYear();
  if (year < 2000 || year > currentYear + 1) return null;
  return year;
}

export default async function AnnualSalariesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authResult = await auth();
  if (!authResult.userId) redirect("/login");

  const db = requireDb();
  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkUserId, authResult.userId),
  });
  if (!currentUser) redirect("/login");

  const yearsWithData = await db
    .selectDistinct({
      year: sql<number>`EXTRACT(YEAR FROM ${payrollPeriods.periodEnd})::int`,
    })
    .from(payrollPeriods)
    .where(
      and(
        eq(payrollPeriods.companyId, currentUser.companyId),
        eq(payrollPeriods.status, "ready"),
      ),
    );

  const currentYear = new Date().getFullYear();
  const dataYears = yearsWithData.map((r) => r.year).sort((a, b) => b - a);

  const availableYears = Array.from(new Set([...dataYears, currentYear])).sort((a, b) => b - a);

  const defaultYear = dataYears.includes(currentYear)
    ? currentYear
    : dataYears[0] ?? currentYear;

  const resolvedParams = await searchParams;
  const rawQueryYear = typeof resolvedParams.year === "string" ? resolvedParams.year : undefined;
  const cookieStore = await cookies();
  const rawCookieYear = cookieStore.get(YEAR_COOKIE)?.value;

  const initialYear = parseYear(rawQueryYear) ?? parseYear(rawCookieYear) ?? defaultYear;

  return <AnnualDashboard initialYear={initialYear} availableYears={availableYears} />;
}