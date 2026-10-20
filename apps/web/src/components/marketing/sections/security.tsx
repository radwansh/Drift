import Link from "next/link";
import { Icon } from "../ui";
import { SECURITY } from "../content";
import { launch } from "@/config/launch";

/**
 * Section 8: security. Anchor #security.
 *
 * Four of the seven points are gated, one flag each, and every gate is off.
 * This is the section where that matters most: these are public claims about
 * how payroll data is handled, and content.md pairs each gated point with the
 * check that has to be true first. Publishing one early would be a false
 * statement about data protection, not an over-eager feature flag.
 *
 * So the filter is deliberately a hard `=== true` on the named switch rather
 * than anything cleverer: a point appears only when its own flag is on.
 */
export function Security() {
  const points = SECURITY.points.filter(
    (p) => p.gate === null || launch.securityPoints[p.gate] === true,
  );

  return (
    <section id="security" className="scroll-mt-20 border-b border-cv-line bg-cv-bg">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <p className="font-cv-mono text-[13px] font-medium uppercase tracking-wide text-cv-ink-subtle">
          {SECURITY.eyebrow}
        </p>
        <h2 className="mt-3 max-w-[28ch] text-3xl font-semibold leading-tight tracking-[-0.02em] text-cv-ink sm:text-4xl">
          {SECURITY.headline}
        </h2>
        <p className="mt-5 max-w-[66ch] text-lg leading-relaxed text-cv-ink-muted">
          {SECURITY.subHeadline}
        </p>

        <ul className="mt-12 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {points.map((point) => (
            <li key={point.title} className="flex gap-4">
              <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-cv-md border border-cv-line bg-cv-surface text-cv-accent">
                <Icon name={point.icon} size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-snug text-cv-ink">{point.title}</h3>
                <p className="mt-1 text-base leading-relaxed text-cv-ink-muted">{point.copy}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-10">
          <Link
            href={SECURITY.linkHref}
            className="rounded font-medium text-cv-accent underline-offset-2 hover:text-cv-accent-hover hover:underline focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
          >
            {SECURITY.link}
          </Link>
        </p>
      </div>
    </section>
  );
}
