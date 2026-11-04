import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { requireDb } from "@saas/db";
import { EmployeeFileView } from "@/components/employee-file/employee-file-view";
import {
  AccountUnavailable,
  NotAvailableForRole,
} from "@/components/employee-file/employee-file-panels";
import { decodeEmployeeId } from "@/components/employee-file/employee-id-url";
import { canReadPayDetail } from "@/lib/roles";
import { ensureUser } from "@/server/ensure-user";

/** Set again rather than inherited from the layout, for the reason in `page.tsx`. */
export const dynamic = "force-dynamic";

export default async function EmployeeFilePage({
  params,
}: {
  params: Promise<{ externalId: string }>;
}) {
  const authResult = await auth();
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

  if (!canReadPayDetail(account.role)) return <NotAvailableForRole />;

  const { externalId } = await params;
  return <EmployeeFileView externalId={decodeEmployeeId(externalId)} />;
}
