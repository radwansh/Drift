"use client";

import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Button, Icon, Logo } from "./ui";
import { NAV } from "./content";

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
 */
export function MarketingHeader() {
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
            <Button href="/sign-in" variant="ghost" size="sm" className="hidden min-[861px]:inline-flex">
              Sign in
            </Button>
            <Button href="/sign-up" variant="accent" size="sm">
              Get early access
            </Button>
          </SignedOut>
          <SignedIn>
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
              <SignedOut>
                <div className="mt-1 border-t border-cv-line pt-1">
                  <a
                    href="/sign-in"
                    className="flex min-h-11 items-center rounded-cv-sm px-3 font-cv-sans text-sm font-medium text-cv-ink hover:bg-cv-surface-sunken focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
                  >
                    Sign in
                  </a>
                </div>
              </SignedOut>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
