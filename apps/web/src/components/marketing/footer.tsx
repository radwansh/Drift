import Link from "next/link";
import { Logo } from "./ui";
import { FOOTER, SITE } from "./content";

/**
 * Section 12: the footer. Dark band on `surface-inverse`, reversed lockup.
 *
 * A server component — nothing here is interactive.
 *
 * The company details line still carries its bracketed placeholders. They are
 * deliberately visible rather than hidden: content.md says to fill them in
 * before publishing, and a blank space is easy to ship by accident where
 * "[legal entity name]" is not.
 */
export function MarketingFooter() {
  return (
    <footer className="bg-cv-surface-inverse text-cv-ink-inverse">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Logo variant="lockup" tone="reversed" height={24} title="Clarivo" />
            <p className="font-cv-sans text-sm text-white/70">{FOOTER.brandLine}</p>
          </div>

          {/* The column labels are not headings. As <h2> they sat alongside
              the nine section headings, so a screen-reader user navigating by
              heading heard twelve page sections where there are nine. As <h3>
              they would skip a level. A labelled list says the same thing
              without claiming to be page structure. */}
          <div className="flex flex-col gap-3">
            <p
              id="footer-product"
              className="font-cv-sans text-[13px] font-semibold uppercase tracking-wide text-white/50"
            >
              Product
            </p>
            <ul aria-labelledby="footer-product" className="flex flex-col gap-2">
              {FOOTER.product.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="rounded font-cv-sans text-sm text-white/80 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-cv-sans text-[13px] font-semibold uppercase tracking-wide text-white/50">
              Contact
            </p>
            <a
              href={`mailto:${SITE.email}`}
              className="rounded font-cv-sans text-sm text-white/80 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
            >
              {SITE.email}
            </a>
          </div>

          <div className="flex flex-col gap-3">
            <p
              id="footer-legal"
              className="font-cv-sans text-[13px] font-semibold uppercase tracking-wide text-white/50"
            >
              Legal
            </p>
            <ul aria-labelledby="footer-legal" className="flex flex-col gap-2">
              {FOOTER.legal.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded font-cv-sans text-sm text-white/80 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-12 border-t border-white/10 pt-6 font-cv-mono text-xs text-white/50">
          {FOOTER.company}
        </p>
      </div>
    </footer>
  );
}
