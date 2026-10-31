import { Badge, Stat } from "../ui";
import { FEATURES, SAMPLE, money, type Currency } from "../content";
import { launch } from "@/config/launch";

/**
 * Section 5: every salary KPI in one click. Anchor #features.
 *
 * Eight tiles that are live in the app today, then six Annual Salaries tiles
 * behind the `annualSalariesLive` switch. The switch is read here rather than
 * in the page so the two tile groups stay next to each other and it is obvious
 * what it controls.
 *
 * The figures are the sample company's, the same ones as the hero, and the
 * group carries a "Sample data" badge for the same reason the hero does.
 */
export function Features({ currency }: { currency: Currency }) {
  const tiles = launch.annualSalariesLive ? [...FEATURES.live, ...FEATURES.annual] : FEATURES.live;

  return (
    <section id="features" className="scroll-mt-20 border-b border-cv-line bg-cv-bg">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <p className="font-cv-mono text-[13px] font-medium uppercase tracking-wide text-cv-ink-subtle">
          {FEATURES.eyebrow}
        </p>
        <h2 className="mt-3 max-w-[28ch] text-3xl font-semibold leading-tight tracking-[-0.02em] text-cv-ink sm:text-4xl">
          {FEATURES.headline}
        </h2>
        <p className="mt-5 max-w-[70ch] text-lg leading-relaxed text-cv-ink-muted">
          {FEATURES.subHeadline}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="font-cv-mono text-xs text-cv-ink-subtle">
            {SAMPLE.company} · {SAMPLE.period}
          </p>
          <Badge>{SAMPLE.badge}</Badge>
        </div>

        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <li key={tile.label} className="flex">
              <Stat
                className="w-full"
                label={tile.label}
                value={<span className="font-cv-mono">{money(tile.value, currency)}</span>}
                caption={"caption" in tile ? tile.caption : undefined}
              />
            </li>
          ))}
        </ul>

        {/* The tile descriptions sit under the grid rather than inside each
            card: the design keeps the cards to label, figure and context so a
            row of them scans as numbers, not as prose. */}
        <dl className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="text-sm leading-snug">
              <dt className="font-semibold text-cv-ink">{tile.label}</dt>
              <dd className="text-cv-ink-muted">{tile.line}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 max-w-[70ch] text-base text-cv-ink-muted">{FEATURES.closing}</p>
      </div>
    </section>
  );
}
