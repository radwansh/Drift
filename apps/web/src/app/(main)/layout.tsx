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

/**
 * The app shell, as drawn on the redesign canvas: a 240px Ink side menu, a 64px top
 * bar, and content up to 1280px wide on `bg` paper, padded space-10 on desktop and
 * space-4 on phones. Pages put their own PageHeader first and stack Panels below it
 * with space-6 between (the `gap-6` on <main>).
 */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const { role, plan } = await resolveGating();

  return (
    <PayrollStoreProvider>
      <SidebarProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-cv-md focus:bg-cv-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-cv-ink focus:shadow-cv-focus-ring"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen bg-cv-bg font-cv-sans text-cv-ink">
          <Sidebar role={role} plan={plan} />
          <div className="flex min-w-0 flex-1 flex-col lg:pl-60">

            <Navbar />
            <main
              id="main"
              className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pb-10 pt-5 sm:px-6 lg:px-10 lg:pt-8"
            >
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </PayrollStoreProvider>
  );
}
