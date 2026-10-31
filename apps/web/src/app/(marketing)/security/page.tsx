import type { Metadata } from "next";
import { Icon, Button } from "@/components/marketing/ui";
import { SECURITY, SITE } from "@/components/marketing/content";
import { launch } from "@/config/launch";

export const metadata: Metadata = {
  title: `Security | ${SITE.name}`,
  description: "How Clarivo protects the payroll data you upload.",
  alternates: { canonical: `${SITE.url}/security` },
};

/**
 * The real /security page, replacing `LegalPagePlaceholder`.
 *
 * It was the one of the four placeholder routes that is marketing copy rather
 * than legal text, and the only one the home page actively promises: the
 * security section's call to action reads "Read how we protect your payroll
 * data →" and landed on "This document is being prepared". The person who
 * clicks that is the one deciding whether to upload their company's salary
 * file, so it was the worst placeholder on the site.
 *
 * **It is generated from `SECURITY.points`, through the identical gate filter
 * the home page section uses.** That is the whole design of this page. These
 * are public claims about how payroll data is handled, and each gated point is
 * paired with a check that has to be true first; hand-writing the prose would
 * mean a page that keeps asserting "Hosted in the EU" the day somebody moves
 * the region, or that goes on omitting "Access by role" after the switch is
 * turned on. Reading the same array through the same `=== true` filter means
 * the page cannot state a claim whose switch is off, and gains one the moment
 * a switch is turned on, in the same commit.
 *
 * `detail` on each point carries the specifics a one-line home page summary
 * cannot: the actual region names, how separation is enforced, what the AI
 * layer does when it is switched off.
 *
 * What this page deliberately does **not** do is enumerate the switched-off
 * points as absences. "We do not have X yet" reads as a stronger statement
 * than the switch actually makes — some of those checks exist in code and are
 * waiting on a review rather than on implementation. So the page says plainly
 * that it lists a claim only once it is true end to end, and keeps the written
 * route open for a procurement review. Being vague about what is missing is a
 * worse failure than being vague about what is present, so the sentence names
 * the gap rather than hiding it.
 */
export default function SecurityPage() {
  const live = SECURITY.points.filter(
    (p) => p.gate === null || launch.securityPoints[p.gate] === true,
  );
  const pending = SECURITY.points.length - live.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
      <h1 className="text-3xl font-semibold leading-tight tracking-[-0.025em] text-cv-ink sm:text-4xl">
        Security
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-cv-ink-muted">
        Salaries are the most sensitive numbers a company has. This page says where your payroll
        data is kept, how it is separated from every other customer&rsquo;s, and what Clarivo does
        and does not do with it.
      </p>

      <ul className="mt-12 flex flex-col gap-10">
        {live.map((point) => (
          <li key={point.title} className="flex gap-4">
            <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-cv-md border border-cv-line bg-cv-surface text-cv-accent">
              <Icon name={point.icon} size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-snug text-cv-ink">{point.title}</h2>
              <p className="mt-1 text-base leading-relaxed text-cv-ink">{point.copy}</p>
              <p className="mt-2 text-base leading-relaxed text-cv-ink-muted">{point.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-14 rounded-cv-lg border border-cv-line bg-cv-surface p-6">
        <h2 className="text-base font-semibold leading-snug text-cv-ink">
          What is not on this page
        </h2>
        <p className="mt-2 text-base leading-relaxed text-cv-ink-muted">
          Clarivo is in beta, and a claim appears here only once it is true from end to end
          {pending > 0 ? (
            <>
              {" "}
              — there {pending === 1 ? "is one further measure" : `are ${pending} further measures`}{" "}
              we will describe here once that is the case, rather than now
            </>
          ) : null}
          . If you need a position in writing for a procurement review, a security questionnaire or
          a data processing agreement, including anything not stated above, write to us and you will
          get the current answer rather than a promise.
        </p>
        <Button href={`mailto:${SITE.email}`} variant="secondary" className="mt-5">
          Email {SITE.email}
        </Button>
      </div>
    </div>
  );
}
