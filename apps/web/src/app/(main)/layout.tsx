import { Sidebar } from "@/components/shared/sidebar";
import { Navbar } from "@/components/shared/navbar";
import { PayrollStoreProvider } from "@/lib/payroll-store";
import { SidebarProvider } from "@/lib/sidebar-context";
import { currentAccount } from "@/server/current-account";

// Every page below this layout is tenant-specific and auth-dependent. Without this
// they build as static pages, which previously caused a cached-auth incident.
export const dynamic = "force-dynamic";

/**
 * The caller's role, for the sidebar's role gating.
 *
 * Resolved here rather than with a `trpc.auth.getMe` query inside the sidebar,
 * which is a client component: that would cost one extra request on every page
 * under `(main)` plus a flash of the ungated nav before it resolved. This is
 * one indexed lookup on a UNIQUE column, on a path that is already dynamic.
 *
 * Every failure returns `null`, the least privileged value, so a lookup error
 * hides the gated link rather than showing one that throws FORBIDDEN on click.
 * It never redirects: the pages below handle an unusable account themselves,
 * and a redirect from a layout would hide the reason.
 *
 * Through `currentAccount`, which is `cache()`d per request — so this and the
 * page it wraps resolve the same user once between them instead of once each.
 */
async function resolveRole(): Promise<string | null> {
  try {
    const account = await currentAccount();
    return account?.role ?? null;
  } catch {
    return null;
  }
}

/**
 * The app shell, as drawn on the redesign canvas: a 240px Ink side menu, a 64px top
 * bar, and content up to 1280px wide on `bg` paper, padded space-10 on desktop and
 * space-4 on phones. Pages put their own PageHeader first and stack Panels below it
 * with space-6 between (the `gap-6` on <main>).
 */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const role = await resolveRole();

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
          <Sidebar role={role} />
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
