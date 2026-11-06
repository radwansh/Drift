import { redirect } from "next/navigation";
import { EmployeeFileView } from "@/components/employee-file/employee-file-view";
import {
  AccountUnavailable,
  NotAvailableForRole,
} from "@/components/employee-file/employee-file-panels";
import { decodeEmployeeId } from "@/components/employee-file/employee-id-url";
import { canReadPayDetail } from "@/lib/roles";
import { currentAccount } from "@/server/current-account";

/** Set again rather than inherited from the layout, for the reason in `page.tsx`. */
export const dynamic = "force-dynamic";

export default async function EmployeeFilePage({
  params,
}: {
  params: Promise<{ externalId: string }>;
}) {
  // Shared with the layout's own lookup, for the reason in `page.tsx`, and
  // `redirect()` stays outside the catch for the same one.
  let account;
  try {
    account = await currentAccount();
  } catch (error) {
    console.error("Employee File: could not resolve the signed-in account:", error);
    return <AccountUnavailable />;
  }

  if (!account) redirect("/login");

  if (!canReadPayDetail(account.role)) return <NotAvailableForRole />;

  const { externalId } = await params;
  return <EmployeeFileView externalId={decodeEmployeeId(externalId)} />;
}
