"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge, Button, Icon, SegmentedControl } from "../ui";
import { PRICING, SITE, money, type Currency } from "../content";
import { launch } from "@/config/launch";
import { EarlyAccessButton } from "../early-access-button";

/**
 * Section 9: pricing. Anchor #pricing.
 *
 * The one section that holds state — the monthly/yearly toggle. The README is
 * clear that this is state and not a launch switch, so it lives in the
 * component rather than in launch.ts.
 *
 * List prices are struck through beside the founder price. The strike-through
 * is a <s> element rather than a line-through class so the "was" price is
 * announced as struck text, and each figure carries a visually hidden label,
 * because "€59 €29" read aloud in sequence is meaningless.
 *
 * The Annual Salaries line in "Every plan includes" is gated: promising it
 * while the dashboard is still being fixed would be selling something that is
 * not ready.
 */
export function Pricing({ currency }: { currency: Currency }) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  const includes = launch.annualSalariesLive
    ? // Restores content.md's order, where the annual line sits fourth.
      [...PRICING.includes.slice(0, 3), PRICING.includesAnnual, ...PRICING.includes.slice(3)]
    : PRICING.includes;

  return (
    <section id="pricing" className="scroll-mt-20 border-b border-cv-line bg-cv-surface">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <p className="font-cv-mono text-[13px] font-medium uppercase tracking-wide text-cv-ink-subtle">
          {PRICING.eyebrow}
        </p>
        <h2 className="mt-3 max-w-[34ch] text-3xl font-semibold leading-tight tracking-[-0.02em] text-cv-ink sm:text-4xl">
          {PRICING.headline}
        </h2>
        <p className="mt-5 max-w-[70ch] text-lg leading-relaxed text-cv-ink-muted">
          {PRICING.subHeadline}
        </p>

        <div className="mt-8">
          <SegmentedControl
            label="Billing period"
            value={billing}
            onChange={(v) => setBilling(v as "monthly" | "yearly")}
            options={[
              { value: "monthly", label: PRICING.toggle.monthly },
              { value: "yearly", label: PRICING.toggle.yearly },
            ]}
          />
        </div>

        {/* Three cards since Bureau moved to its own strip below. Every plan
            left here is priced per company, which is why `per` no longer has a
            per-client branch. */}
        <ul className="mt-8 grid gap-5 lg:grid-cols-3">
          {PRICING.plans.map((plan) => {
            /**
             * Both billing cycles, always, with the inactive one hidden.
             *
             * This component is `"use client"` and starts at `monthly`, so
             * when it rendered only the active cycle the server HTML contained
             * the monthly figures alone and the yearly ones existed only after
             * a click. Crawlers with limited JavaScript — which includes
             * GPTBot, ClaudeBot and PerplexityBot — therefore never saw
             * ¤290 / ¤490 / ¤1,490 at all, and the JSON-LD did not make up for
             * it: its AggregateOffer carries the monthly range only.
             *
             * Rendering both and hiding one with `hidden` puts both in the
             * markup. `hidden` rather than a CSS class on purpose: it removes
             * the inactive figures from the accessibility tree too, so a
             * screen reader is not read two prices for one plan.
             *
             * Per-market currency: the numerals are stored once and the symbol
             * substituted here, so the euro and dollar ladders cannot drift.
             */
            const cycles = (["monthly", "yearly"] as const).map((cycle) => ({
              cycle,
              founder: money(
                cycle === "yearly" ? plan.founderYearly : plan.founderMonthly,
                currency,
              ),
              list: money(cycle === "yearly" ? plan.listYearly : plan.listMonthly, currency),
              per: cycle === "yearly" ? "per year" : "per month",
            }));

            return (
              <li key={plan.name} className="flex">
                <div
                  className={cn(
                    "flex w-full flex-col gap-4 rounded-cv-lg border bg-cv-surface p-6",
                    plan.highlighted
                      ? "border-cv-accent shadow-cv-md ring-1 ring-cv-accent"
                      : "border-cv-line",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-cv-ink">{plan.name}</h3>
                    {"tag" in plan && plan.tag && <Badge tone="accent">{plan.tag}</Badge>}
                  </div>
                  <p className="text-sm text-cv-ink-muted">{plan.for}</p>

                  {cycles.map((c) => (
                    <div key={c.cycle} hidden={c.cycle !== billing}>
                      <p className="flex flex-wrap items-baseline gap-2 font-cv-mono">
                        <s className="text-base text-cv-ink-disabled">
                          <span className="sr-only">List price </span>
                          {c.list}
                        </s>
                        <span className="text-3xl font-medium tracking-[-0.02em] text-cv-ink">
                          <span className="sr-only">Founder price </span>
                          {c.founder}
                        </span>
                      </p>
                      <p className="mt-2 text-xs text-cv-ink-subtle">{c.per}</p>
                    </div>
                  ))}

                  <Badge tone="signal">{PRICING.founderBadge}</Badge>

                  <EarlyAccessButton
                    variant={plan.highlighted ? "accent" : "secondary"}
                    className="mt-auto"
                  >
                    {PRICING.cta}
                  </EarlyAccessButton>
                </div>
              </li>
            );
          })}
        </ul>

        {/* The two plans sold by conversation rather than by card. */}
        <ContactStrip
          name={PRICING.enterprise.name}
          audience={PRICING.enterprise.for}
          price={PRICING.enterprise.price}
          note={PRICING.enterprise.note}
          cta={PRICING.enterprise.cta}
        />
        <ContactStrip
          name={PRICING.bureau.name}
          audience={PRICING.bureau.for}
          note={PRICING.bureau.note}
          cta={PRICING.bureau.cta}
        />

        <div className="mt-10">
          <h3 className="text-base font-semibold text-cv-ink">{PRICING.includesTitle}</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {includes.map((item) => (
              <li key={item} className="flex items-start gap-2 text-base text-cv-ink-muted">
                <span className="mt-1 flex-none text-cv-success">
                  <Icon name="check" size={16} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 max-w-[75ch] text-sm leading-relaxed text-cv-ink-muted">
          {PRICING.sizeLine}
        </p>
        <p className="mt-3 max-w-[75ch] text-xs leading-relaxed text-cv-ink-subtle">
          {PRICING.smallPrint}
        </p>
      </div>
    </section>
  );
}

/**
 * A full-width row for a plan that is quoted rather than listed: Enterprise and
 * Bureau. One component so the pair cannot drift apart visually.
 *
 * `price` is optional, which is the only difference between them — Enterprise
 * says "On request" where Bureau says nothing at all, and the note carries the
 * terms in both cases.
 */
function ContactStrip({
  name,
  audience,
  price,
  note,
  cta,
}: {
  name: string;
  audience: string;
  price?: string;
  note: string;
  cta: string;
}) {
  return (
    <div className="mt-5 flex flex-col gap-4 rounded-cv-lg border border-cv-line bg-cv-bg p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-cv-ink">{name}</h3>
        <p className="mt-1 text-sm text-cv-ink-muted">{audience}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <p className="font-cv-mono text-base text-cv-ink">
          {price}
          <span className={cn("text-sm text-cv-ink-subtle", price && "ml-2")}>{note}</span>
        </p>
        <Button href={`mailto:${SITE.email}`} variant="secondary">
          {cta}
        </Button>
      </div>
    </div>
  );
}
