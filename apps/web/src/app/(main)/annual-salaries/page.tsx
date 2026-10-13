import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql, eq, and } from "drizzle-orm";
import { requireDb, payrollPeriods } from "@saas/db";
import { AnnualDashboard } from "@/components/annual/annual-dashboard";
import { ensureUser } from "@/server/ensure-user";
import { AlertCircle } from "lucide-react";

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

/**
 * Shown when the caller is signed in but has no usable account row (step 2 of
 * docs/ANNUAL_PAGE_FIX_PLAN.md).
 *
 * This page used to `redirect("/login")` here. Because `/login` is a public
 * route, Clerk did not challenge an already-signed-in visitor and instead
 * honoured `afterSignInUrl="/dashboard"` — so a failed lookup presented as the
 * page quietly throwing the user back to the dashboard, with the reason lost.
 */
function AccountUnavailable() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-2xl font-bold text-foreground">Could not open your account</h2>
      <p className="mt-2 max-w-md text-center text-muted-foreground">
        You are signed in, but we could not load the company this page belongs to. Reloading
        usually works. If it keeps happening, the account needs attention rather than another
        attempt.
      </p>
    </div>
  );
}

export default async function AnnualSalariesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authResult = await auth();
  // The only redirect left: genuinely not signed in.
  if (!authResult.userId) redirect("/login");

  const db = requireDb();

  const clerk = await currentUser();
  let account;
  try {
    account = await ensureUser(db, authResult.userId, {
      email:
        clerk?.primaryEmailAddress?.emailAddress ?? clerk?.emailAddresses[0]?.emailAddress ?? null,
      name: [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ") || null,
    });
  } catch (error) {
    console.error("Annual Salaries: could not resolve the signed-in account:", error);
    return <AccountUnavailable />;
  }

  const yearsWithData = await db
    .selectDistinct({
      year: sql<number>`EXTRACT(YEAR FROM ${payrollPeriods.periodEnd})::int`,
    })
    .from(payrollPeriods)
    .where(
      and(
        eq(payrollPeriods.companyId, account.companyId),
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