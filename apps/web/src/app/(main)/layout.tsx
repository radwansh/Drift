import { auth } from "@clerk/nextjs/server";
import { requireDb } from "@saas/db";
import { Sidebar } from "@/components/shared/sidebar";
import { Navbar } from "@/components/shared/navbar";
import { PayrollStoreProvider } from "@/lib/payroll-store";
import { SidebarProvider } from "@/lib/sidebar-context";
import { ensureUser } from "@/server/ensure-user";

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
 */
async function resolveRole(): Promise<string | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const account = await ensureUser(requireDb(), userId);
    return account.role;
  } catch {
    return null;
  }
}

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const role = await resolveRole();

  return (
    <PayrollStoreProvider>
      <SidebarProvider>
        <div className="flex min-h-screen">
          <Sidebar role={role} />
          <div className="flex-1 lg:pl-64">
            <Navbar />
            <main className="p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </PayrollStoreProvider>
  );
}
