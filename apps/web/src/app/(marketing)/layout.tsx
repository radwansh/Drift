import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { EarlyAccessProvider } from "@/components/marketing/early-access-provider";
import { authEntryPointsVisible } from "@/config/environment";

/**
 * Layout for the public pages: /, /privacy, /terms, /security, /dpa.
 *
 * These render statically. Note the absence of `export const dynamic =
 * "force-dynamic"` — the opposite of every page under (main). The header's
 * signed-in check is client-side precisely so this stays true; a server-side
 * Clerk call anywhere in here would turn all five pages dynamic.
 *
 * Fonts now come from app/fonts.ts through the root layout, which applies both
 * variables on <html>; this layout used to load them itself (the reasons for
 * self-hosting are kept in that module).
 *
 * Light only: the app follows the system theme, but the landing page is designed
 * light with two dark bands, so the wrapper pins `data-theme="light"`.
 * clarivo-tokens.css and globals.css re-declare every light value on that
 * attribute, so this subtree stays light even when <html> carries `.dark`.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="light"
      className="flex min-h-screen flex-col bg-cv-bg font-cv-sans text-cv-ink antialiased"
    >
      {/* One dialog for the page, inside the themed wrapper so it inherits the
          cv- tokens and the font variables. */}
      <EarlyAccessProvider>
        {/* Read here, in a server component, and passed down: VERCEL_ENV is not
            available to client code, and the header is a client component. */}
        <MarketingHeader showAuth={authEntryPointsVisible} />
        <main className="flex-1">{children}</main>
        <MarketingFooter />
      </EarlyAccessProvider>
    </div>
  );
}
