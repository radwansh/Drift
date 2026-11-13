import { redirect } from "next/navigation";
import { EmptyState } from "@/components/shared/empty-state";
import { IntegrationsList } from "@/components/integrations/integrations-list";
import { hasIntegrations } from "@/lib/plans";
import { currentAccount } from "@/server/current-account";
import { AlertCircle, Lock } from "lucide-react";

/**
 * Integrations, gated to Enterprise.
 *
 * `(main)/layout.tsx` already sets this, and it is set again here on purpose:
 * a statically rendered protected page has already leaked a cached auth
 * response in this product, and a route that depends on its layout for that is
 * one `export` away from doing it again.
 */
export const dynamic = "force-dynamic";

/**
 * **Nothing in the app sets a company's plan.** `companies.settings.plan` is
 * written by no procedure and no form, so every company reads `"free"` and
 * this page is therefore closed to everyone, the account owner included. That
 * is the intent: the screen advertises five payroll connectors, none of which
 * exists — there is no sync job anywhere in the repo and `syncStatus` is a
 * stub. Putting a company on Enterprise today means a direct write to
 * `companies.settings`, e.g.
 *
 * ```sql
 * UPDATE companies
 * SET settings = settings || '{"plan":"enterprise"}'::jsonb
 * WHERE id = '…';
 * ```
 *
 * The gate is the same `INTEGRATION_PLANS` the sidebar filters on, through
 * `hasIntegrations`, so the hidden link and the closed page cannot disagree.
 *
 * It is a panel rather than a `notFound()`: a customer who followed a bookmark
 * or a shared URL should read why the page is closed, not a 404 implying it
 * never existed. The Employee File's role panels make the same choice for the
 * same reason, and both are backed by the server — the sidebar's filtering is
 * cosmetic.
 *
 * **Unlike the Employee File, the procedures behind this page are not gated.**
 * `integrations.list`, `configure` and `disconnect` are `protectedProcedure`
 * and still answer any signed-in member who calls them directly. Narrowing
 * them is a gate move on a surface this brief did not cover; what it would
 * protect is a provider name in a JSON column, not pay detail. Worth doing,
 * separately.
 */
export default async function IntegrationsPage() {
  let account;
  try {
    account = await currentAccount();
  } catch (error) {
    console.error("Integrations: could not resolve the signed-in account:", error);
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not open your account"
        description="You are signed in, but we could not load the company this page belongs to. Reloading usually works; if it keeps happening the account needs attention rather than another attempt."
      />
    );
  }

  // `redirect()` throws a control-flow error, so it stays outside the catch:
  // inside, it would be swallowed and shown as an account failure to somebody
  // who is merely signed out.
  if (!account) redirect("/login");

  if (!hasIntegrations(account.plan)) {
    return (
      <EmptyState
        icon={Lock}
        title="Integrations are an Enterprise feature"
        description="Connectors to SAP, ADP, Sage, Workday and Gusto are part of the Enterprise plan. Until then, payroll data comes in by upload — which is how every comparison in Clarivo is built today. See Settings → Billing for the plans."
      />
    );
  }

  return <IntegrationsList />;
}
