import { Badge, Button, DriftStrip, Stat } from "../ui";
import { HERO, SAMPLE } from "../content";
import { EarlyAccessButton } from "../early-access-button";

/**
 * Section 2: the hero. Carries the page's only H1.
 *
 * The dashboard visual is built from the design-system components rather than
 * being a screenshot, which is how the design has it — it stays sharp at every
 * width and the figures stay editable. Because it reads as a picture rather
 * than as data, the whole figure takes role="img" with the alt text from
 * content.md as its label, and the Stat cards inside are hidden from the
 * accessibility tree by that one name.
 *
 * The baseline strip under the section is the signature device: 160 ticks with
 * tick 86 drifted, per the README.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-cv-line bg-cv-surface">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-24">
        <div className="flex flex-col items-start gap-6">
          <p className="font-cv-mono text-[13px] font-medium uppercase tracking-wide text-cv-ink-subtle">
            {HERO.eyebrow}
          </p>

          <h1 className="text-balance text-4xl font-semibold leading-[1.06] tracking-[-0.035em] text-cv-ink sm:text-5xl lg:text-[56px]">
            {HERO.headline}
          </h1>

          <p className="max-w-[58ch] text-lg leading-relaxed text-cv-ink-muted">
            {HERO.subHeadline}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <EarlyAccessButton variant="accent" size="lg" iconRight="arrow-right">
              {HERO.primary}
            </EarlyAccessButton>
            <Button href="#how-it-works" variant="secondary" size="lg">
              {HERO.secondary}
            </Button>
          </div>

          <p className="text-sm text-cv-ink-subtle">{HERO.trust}</p>
        </div>

        {/* One accessible name for the whole visual: it is a picture of the
            product, not a table a reader should walk through. */}
        <figure role="img" aria-label={HERO.visualAlt} className="min-w-0">
          <div className="rounded-cv-xl border border-cv-line bg-cv-bg p-4 shadow-cv-lg sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="font-cv-mono text-xs text-cv-ink-subtle">
                {SAMPLE.company} · {SAMPLE.period}
              </p>
              <Badge>{SAMPLE.badge}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Stat
                label="Total variance"
                value={SAMPLE.totalVariance}
                caption={`${SAMPLE.totalVariancePct} vs August`}
              />
              <Stat label="Employees affected" value={SAMPLE.employeesAffected} caption={`of ${SAMPLE.headcount}`} />
              <Stat label="New employees" value={SAMPLE.newEmployees} />
              <Stat label="Departed employees" value={SAMPLE.departedEmployees} />
            </div>

            {/* The flagged anomaly, in rust, which is the whole point of the picture. */}
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-cv-lg border border-cv-signal/30 bg-cv-signal-soft p-4">
              <Badge tone="signal" icon="alert">
                Warning
              </Badge>
              <p className="min-w-0 flex-1 text-sm text-cv-ink">
                <span className="font-semibold">Sara K., Sales.</span> Net pay +32% with no change in
                any pay component.
              </p>
            </div>
          </div>
        </figure>
      </div>

      <div className="flex justify-center pb-10">
        <DriftStrip count={160} drift={86} size="lg" animate="lift" className="max-w-full" />
      </div>
    </section>
  );
}
