import { redirect } from "next/navigation";
import { EmployeeList } from "@/components/employee-file/employee-list";
import {
  AccountUnavailable,
  NotAvailableForRole,
} from "@/components/employee-file/employee-file-panels";
import { canReadPayDetail } from "@/lib/roles";
import { currentAccount } from "@/server/current-account";

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
  /**
   * One account lookup per request, shared with `(main)/layout.tsx`.
   *
   * The layout resolves the same user to gate the sidebar, so this page used to
   * cost a second identical query plus a second `currentUser()` call to Clerk
   * for a profile `ensureUser` only reads on the create path. `currentAccount`
   * is `cache()`d per request, so the two now share one lookup and no Clerk
   * request at all on the common path.
   *
   * `redirect()` throws a control-flow error, so it stays **outside** the
   * `catch` — inside, the catch would swallow it and render the unavailable
   * panel to somebody who is merely signed out.
   */
  let account;
  try {
    account = await currentAccount();
  } catch (error) {
    console.error("Employee File: could not resolve the signed-in account:", error);
    return <AccountUnavailable />;
  }

  // The only redirect: genuinely not signed in.
  if (!account) redirect("/login");

  // The server-side role check. `payDetailProcedure` refuses the data anyway,
  // so this is about what a viewer *reads* when they follow a stale bookmark.
  if (!canReadPayDetail(account.role)) return <NotAvailableForRole />;

  return <EmployeeList />;
}
