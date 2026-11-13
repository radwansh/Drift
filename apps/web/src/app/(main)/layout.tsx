import { Sidebar } from "@/components/shared/sidebar";
import { Navbar } from "@/components/shared/navbar";
import { PayrollStoreProvider } from "@/lib/payroll-store";
import { SidebarProvider } from "@/lib/sidebar-context";
import { currentAccount } from "@/server/current-account";
import type { PlanId } from "@/lib/plans";

// Every page below this layout is tenant-specific and auth-dependent. Without this
// they build as static pages, which previously caused a cached-auth incident.
export const dynamic = "force-dynamic";

/**
 * The caller's role and the plan their company is on, for the sidebar's two
 * gating axes.
 *
 * Resolved here rather than with a `trpc.auth.getMe` query inside the sidebar,
 * which is a client component: that would cost one extra request on every page
 * under `(main)` plus a flash of the ungated nav before it resolved. This is
 * one indexed lookup on a UNIQUE column, on a path that is already dynamic —
 * and still one after the plan was added to it, because `currentAccount` reads
 * the company's `settings` in the same join rather than in a second query.
 *
 * Every failure returns `null` for both, the least privileged values, so a
 * lookup error hides a gated link rather than showing one that throws FORBIDDEN
 * on click or lands on a page the plan does not include. It never redirects:
 * the pages below handle an unusable account themselves, and a redirect from a
 * layout would hide the reason.
 *
 * Through `currentAccount`, which is `cache()`d per request — so this and the
 * page it wraps resolve the same user once between them instead of once each.
 */
async function resolveGating(): Promise<{ role: string | null; plan: PlanId | null }> {
  try {
    const account = await currentAccount();
    return { role: account?.role ?? null, plan: account?.plan ?? null };
  } catch {
    return { role: null, plan: null };
  }
}

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const { role, plan } = await resolveGating();

  return (
    <PayrollStoreProvider>
      <SidebarProvider>
        <div className="flex min-h-screen">
          <Sidebar role={role} plan={plan} />
          <div className="flex-1 lg:pl-64">
            <Navbar />
            <main className="p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </PayrollStoreProvider>
  );
}
