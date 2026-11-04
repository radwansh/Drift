import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { requireDb } from "@saas/db";
import { EmployeeList } from "@/components/employee-file/employee-list";
import {
  AccountUnavailable,
  NotAvailableForRole,
} from "@/components/employee-file/employee-file-panels";
import { canReadPayDetail } from "@/lib/roles";
import { ensureUser } from "@/server/ensure-user";

/**
 * The employee list (step E1 of docs/EMPLOYEE_FILE_PLAN.md).
 *
 * `(main)/layout.tsx` already sets this, and it is set again here on purpose:
 * a statically rendered protected page has already leaked a cached auth
 * response in this product, and a route that depends on the layout for that is
 * one `export` away from doing it again.
 */
export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const authResult = await auth();
  // The only redirect: genuinely not signed in.
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
    console.error("Employee File: could not resolve the signed-in account:", error);
    return <AccountUnavailable />;
  }

  // The server-side role check. `payDetailProcedure` refuses the data anyway,
  // so this is about what a viewer *reads* when they follow a stale bookmark.
  if (!canReadPayDetail(account.role)) return <NotAvailableForRole />;

  return <EmployeeList />;
}
