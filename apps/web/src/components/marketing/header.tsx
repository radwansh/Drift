"use client";

import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Button, Icon, Logo } from "./ui";
import { NAV } from "./content";
import { EarlyAccessButton } from "./early-access-button";

/**
 * Section 1: the sticky public header.
 *
 * A client component for one reason only — Clerk's `SignedIn` / `SignedOut`
 * decide per visitor whether the buttons read "Sign in / Get early access" or
 * "Open Clarivo". That check has to be client-side so the marketing pages stay
 * statically rendered; a server-side `auth()` call here would make every public
 * page dynamic, which is exactly what the hand-off forbids.
 *
 * Below 861 px the links fold into a native `<details>` menu. Native, not
 * state: it needs no JavaScript, closes on Escape for free, and keeps the
 * whole header server-renderable apart from the Clerk gate.
 *
 * `showAuth` comes from the layout rather than being read here, because the
 * signal is `VERCEL_ENV` and this file is a client component — see
 * config/environment.ts for why that is deliberately not a NEXT_PUBLIC_ value.
 */
export function MarketingHeader({ showAuth }: { showAuth: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-cv-line bg-cv-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex-none rounded focus-visible:outline-none focus-visible:shadow-cv-focus-ring">
          <Logo variant="lockup" height={24} title="Clarivo" />
        </Link>

        {/* Desktop links. 861px is the design's fold point, so this is a
            one-off arbitrary breakpoint rather than a Tailwind step. */}
        <nav className="ml-auto hidden items-center gap-1 min-[861px]:flex" aria-label="Sections">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-cv-sm px-3 py-2 font-cv-sans text-sm font-medium text-cv-ink-muted transition-colors hover:bg-cv-surface-sunken hover:text-cv-ink focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 min-[861px]:ml-0">
          <SignedOut>
            {/* Hidden on production until launch. "Get early access" stays:
                it collects a lead, it does not open an account. */}
            {showAuth && (
              <Button href="/sign-in" variant="ghost" size="sm" className="hidden min-[861px]:inline-flex">
                Sign in
              </Button>
            )}
            <EarlyAccessButton variant="accent" size="sm">
              Get early access
            </EarlyAccessButton>
          </SignedOut>
          <SignedIn>
            {/* Always shown. Somebody already signed in is past the gate, and
                hiding their way back to the app would only strand them. */}
            <Button href="/dashboard" variant="accent" size="sm">
              Open Clarivo
            </Button>
          </SignedIn>

          {/* Mobile menu. 44px targets inside, per the README. */}
          <details className="group relative min-[861px]:hidden">
            <summary
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-cv-md text-cv-ink marker:hidden hover:bg-cv-surface-sunken focus-visible:outline-none focus-visible:shadow-cv-focus-ring [&::-webkit-details-marker]:hidden"
              aria-label="Menu"
            >
              <Icon name="menu" size={20} />
            </summary>
            <div className="absolute right-0 top-12 w-60 rounded-cv-lg border border-cv-line bg-cv-surface p-2 shadow-cv-lg">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex min-h-11 items-center rounded-cv-sm px-3 font-cv-sans text-sm font-medium text-cv-ink hover:bg-cv-surface-sunken focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
                >
                  {item.label}
                </a>
              ))}
              {showAuth && (
                <SignedOut>
                  <div className="mt-1 border-t border-cv-line pt-1">
                    {/* next/link, not <a>: this one goes to a route rather than
                        an in-page anchor, and no-html-link-for-pages is an error. */}
                    <Link
                      href="/sign-in"
                      className="flex min-h-11 items-center rounded-cv-sm px-3 font-cv-sans text-sm font-medium text-cv-ink hover:bg-cv-surface-sunken focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
                    >
                      Sign in
                    </Link>
                  </div>
                </SignedOut>
              )}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
