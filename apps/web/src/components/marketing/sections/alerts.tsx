import { Badge, Variance } from "../ui";
import { ALERTS, SAMPLE } from "../content";
import { launch } from "@/config/launch";

/**
 * Section 6: payroll anomaly alerts. The first dark band.
 *
 * Every severity chip carries a word AND an icon as well as its tone, so
 * meaning never rests on colour alone — the design system is firm about that,
 * and it matters most here, where the tone is the ranking.
 *
 * The Data check card sits behind `annualSalariesLive`: it reports missing
 * periods and totals that do not reconcile, which are the annual engine's
 * checks.
 */
export function Alerts() {
  const cards = launch.annualSalariesLive ? [...ALERTS.cards, ALERTS.dataCheck] : ALERTS.cards;

  return (
    <section className="bg-cv-surface-inverse text-cv-ink-inverse">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <p className="font-cv-mono text-[13px] font-medium uppercase tracking-wide text-white/50">
          {ALERTS.eyebrow}
        </p>
        <h2 className="mt-3 max-w-[30ch] text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
          {ALERTS.headline}
        </h2>
        <p className="mt-5 max-w-[70ch] text-lg leading-relaxed text-white/70">
          {ALERTS.subHeadline}
        </p>

        {/* The sample alert, shown large as it appears in the app. */}
        <figure role="img" aria-label={ALERTS.sampleAlt} className="mt-10">
          <div className="rounded-cv-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone="signal" icon="alert">
                {ALERTS.sample.severity}
              </Badge>
              <span className="font-cv-mono text-xs text-white/50">{SAMPLE.badge}</span>
            </div>
            <p className="mt-4 text-xl font-semibold leading-snug sm:text-2xl">
              {ALERTS.sample.employee}, {ALERTS.sample.department}
            </p>
            <p className="mt-2 max-w-[60ch] text-base text-white/70">{ALERTS.sample.line}</p>
            <div className="mt-5 border-t border-white/10 pt-5">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Net pay and pay components for {ALERTS.sample.employee}, this period against last
                </caption>
                <thead>
                  <tr className="text-white/50">
                    <th scope="col" className="pb-2 font-medium">
                      Line
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody className="font-cv-mono">
                  <tr className="border-t border-white/10">
                    <th scope="row" className="py-2 font-normal text-white/80">
                      Net pay
                    </th>
                    <td className="py-2 text-right">
                      <Variance value={1240} percent={32} currency="EUR" decimals={0} flagged size="lg" />
                    </td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <th scope="row" className="py-2 font-normal text-white/80">
                      Pay components
                    </th>
                    <td className="py-2 text-right">
                      <Variance value={0} currency="EUR" decimals={0} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </figure>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <li
              key={card.title}
              className="flex flex-col gap-3 rounded-cv-lg border border-white/10 bg-white/[0.03] p-5"
            >
              <Badge tone={card.tone} icon={card.icon}>
                {card.severity}
              </Badge>
              <h3 className="text-base font-semibold leading-snug">{card.title}</h3>
              <p className="text-sm leading-relaxed text-white/70">{card.line}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col gap-3">
          <p className="max-w-[70ch] text-base text-white/70">{ALERTS.aiSummary}</p>
          <p className="max-w-[70ch] text-base font-medium">{ALERTS.control}</p>
        </div>
      </div>
    </section>
  );
}
