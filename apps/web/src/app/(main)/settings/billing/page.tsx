"use client";

import { Badge, Button, DriftStrip, Notice, PageHeader, Panel } from "@/components/cv";
import { PlanCard } from "@/components/settings/billing-card";
import {
  LIST_CURRENCY,
  planDisplayName,
  pricingLadder,
} from "@/components/settings/pricing-ladder";
import { PRICING, SITE, money } from "@/components/marketing/content";
import { parsePlan } from "@/lib/plans";
import { trpc } from "@/lib/trpc";

/**
 * Billing, from `settings.getBillingInfo`, on Ink & Signal.
 *
 * What this page used to show, none of which came from anywhere: a
 * "Professional" plan at $299 marked Active, **four paid invoices**
 * (INV-001…004, at $299 and $199), "16 of 1,000" active employees, "3"
 * comparisons this month, a next billing date of Jul 1 2026, and a
 * $99 / $299 / Custom ladder with hand-written per-plan feature lists. The
 * marketing site says the product is free in beta, so this page told a
 * customer they had been charged about a thousand dollars they had not been
 * charged. The redesign restyled that page; its copy was discarded rather than
 * merged, because every number its styling framed has since been deleted.
 *
 * Three rules hold the replacement together:
 *
 * 1. **The plan is whatever the database says.** `getBillingInfo` reads
 *    `companies.settings` and defaults to `plan: "free"`,
 *    `status: "inactive"`. Nothing in the app ever sets either, so every
 *    company today is free and inactive, and the page says so in the words the
 *    site uses.
 * 2. **The invoices are gone, not stubbed.** There is no invoice source in
 *    this product: no table, no Stripe dependency, no `STRIPE_*` key read
 *    anywhere. "No invoices yet" is the whole truth.
 * 3. **The ladder is read from `PRICING`**, through
 *    `components/settings/pricing-ladder.ts`, never retyped.
 *
 * **Billing is Polar now, and the same rule governs every control.** A link
 * appears on this page only when something real is behind it:
 *
 * - **"Manage billing"** renders only when `getBillingInfo` reports
 *   `portalAvailable`, which needs both a Polar access token on this deployment
 *   and a Polar customer recorded against this company. Clicking it creates a
 *   real customer-portal session through Polar's API and follows the URL Polar
 *   answers. It replaces no button — there was none, because
 *   `createBillingPortal` used to return
 *   `https://billing.stripe.com/session/<subscription id>`, concatenated from a
 *   subscription id no company has ever had, and that URL has never resolved.
 * - **"Continue to checkout"** renders on a plan card only when that plan has a
 *   `POLAR_CHECKOUT_LINK_<PLAN>` configured and the caller may buy. One link
 *   per plan: Polar's Checkout Links are per product, so there is no single
 *   link that covers the ladder.
 *
 * Neither is configured anywhere today, so this page still renders exactly as
 * it did — which is the point of checking rather than assuming.
 *
 * **The figures above a checkout button are not a promise about what Polar will
 * charge.** `PRICING` says €29 list and €14 founder, this page says the product
 * is free during the beta, and the Starter checkout that exists charges €29.
 * Those are three different stories and resolving them is a pricing decision,
 * not a code change, so nothing here is written as though one of them were
 * settled: the button states no figure and says the price is confirmed at
 * checkout.
 */
export default function BillingPage() {
  const billing = trpc.settings.getBillingInfo.useQuery();
  const checkout = trpc.settings.getCheckout.useQuery();
  const ladder = pricingLadder();

  /**
   * Opening the portal is a mutation because it creates a session at Polar.
   * The redirect happens here rather than server-side: the URL is short-lived
   * and single-use, so it is followed immediately and never stored or rendered.
   */
  const portal = trpc.settings.createBillingPortal.useMutation({
    onSuccess: (result) => {
      if (result.url) window.location.href = result.url;
    },
  });

  const plan = parsePlan(billing.data?.plan);
  const unrecognised = billing.data !== undefined && plan === null;

  /** A plan's checkout link, or null — the page never builds one itself. */
  const checkoutUrlFor = (rungId: typeof ladder[number]["id"]): string | null =>
    checkout.data?.plans.find((entry) => entry.plan === rungId)?.url ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Your plan"
        lede="What this company is on today, and what Clarivo costs."
      />

      {billing.isPending && (
        <Panel title="Current plan">
          <div className="flex flex-col items-center justify-center gap-3 py-10" aria-busy="true">
            <DriftStrip size="lg" count={24} animate="scan" label="Loading your plan" />
            <p className="m-0 text-sm text-cv-ink-subtle">Loading your plan</p>
          </div>
        </Panel>
      )}

      {billing.error && (
        <Notice tone="danger" title="Could not load your billing">
          {billing.error.message}
        </Notice>
      )}

      {billing.data && (
        <Panel
          title="Current plan"
          actions={
            /* `status` is a raw string from free-form JSON, so it is shown as
               it is stored rather than mapped to a word this page invents. */
            billing.data.status === "active" ? (
              <Badge tone="success" icon="check">
                {billing.data.status}
              </Badge>
            ) : (
              <Badge tone="neutral">{billing.data.status}</Badge>
            )
          }
          description={planDisplayName(plan, billing.data.plan)}
        >
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-cv-ink-muted">
            {plan === "free" && (
              /* The promise the site makes, in the terms it makes it — a
                 customer reading both must not find two stories. */
              <p className="m-0">
                Clarivo is free while it is in beta, and no payment method is held. When billing
                starts, every company that joined during the beta pays the founder price below for
                24 months.
              </p>
            )}

            {unrecognised && (
              <p className="m-0">
                This company is recorded on a plan this page does not publish. Nothing is billed
                through the app, so what applies is whatever was agreed directly.
              </p>
            )}

            {billing.data.subscriptionId === null ? (
              <p className="m-0">No subscription on record, so there is nothing to renew or cancel.</p>
            ) : (
              <p className="m-0">
                Subscription{" "}
                <code className="rounded-cv-sm bg-cv-surface-sunken px-1.5 py-0.5 font-cv-mono text-[13px] text-cv-ink">
                  {billing.data.subscriptionId}
                </code>
                {periodEndSentence(billing.data.periodEnd)}
              </p>
            )}

            <p className="m-0">
              Billing is handled by a person rather than by this screen: write to{" "}
              <a
                className="text-cv-accent underline underline-offset-2"
                href={`mailto:${SITE.email}`}
              >
                {SITE.email}
              </a>{" "}
              to change plan, ask about an invoice, or close the account.
            </p>

            {billing.data.portalAvailable && (
              /* Only when Polar holds a customer for this company AND this
                 deployment has a token to ask with. Both are false everywhere
                 today, so nothing renders — which is the honest result, not a
                 missing feature. */
              <div className="flex flex-col gap-1.5">
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => portal.mutate({})}
                    loading={portal.isPending}
                  >
                    Manage billing
                  </Button>
                </div>
                {portal.data?.url === null && (
                  <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                    Polar could not open a billing session just now. Write to {SITE.email} and it
                    will be handled directly.
                  </p>
                )}
                {portal.error && (
                  <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                    {portal.error.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel title="Invoices" description="Nothing has been billed yet.">
        {/* Four invented paid invoices stood here. There is no invoice source
            in this product, so the empty state is the whole truth — and a
            real state, not a placeholder for the table to come back to. */}
        <p className="m-0 text-sm leading-relaxed text-cv-ink-muted">
          No invoices yet. Clarivo has not charged this company; invoices will appear here once
          billing starts.
        </p>
      </Panel>

      {/* Not a Panel: each rung below is one, and a card inside a card reads
          as a nesting rather than a list. A heading and the grid instead. */}
      <section aria-labelledby="plans-heading" className="flex flex-col gap-4">
        <div>
          <h3
            id="plans-heading"
            className="m-0 text-[20px] font-semibold leading-7 tracking-[-0.01em] text-cv-ink"
          >
            Plans
          </h3>
          <p className="m-0 mt-1 text-sm text-cv-ink-muted">By employee count, per company.</p>
          {/* Said only when there is something a viewer is being kept from.
              With no checkout configured, nobody can buy from this screen and
              the role is not the reason, so the line would mislead. */}
          {checkout.data?.configured === true && checkout.data.canCheckout === false && (
            <p className="m-0 mt-1 text-[13px] leading-[18px] text-cv-ink-subtle">
              An admin or manager can change the plan for this company.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {ladder.map((rung) => (
              <PlanCard
                key={rung.name}
                name={rung.name}
                audience={rung.audience}
                listPrice={rung.listPrice}
                founderPrice={rung.founderPrice}
                interval={rung.interval}
                onRequest={rung.onRequest}
                footnote={rung.footnote}
                current={plan !== null && rung.id === plan}
                highlighted={rung.highlighted}
                tag={rung.tag}
                checkoutUrl={checkoutUrlFor(rung.id)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="m-0 text-[15px] font-semibold leading-[22px] text-cv-ink">
              {PRICING.includesTitle}
            </h4>
            {/* One list for every plan, because that is how they are sold. The
                per-plan feature lists this page used to carry said the opposite
                — "10 comparisons/month" on Starter — and contradicted
                `PRICING.includes` as well as each other. */}
            <ul className="m-0 grid list-none gap-1.5 p-0 text-sm text-cv-ink-muted sm:grid-cols-2">
              {PRICING.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="m-0 pt-2 text-[13px] leading-[18px] text-cv-ink-subtle">
              {PRICING.sizeLine}
            </p>
            {/* The published terms, verbatim and in one place: VAT, cancellation,
                how long the founder price lasts. Through `money()` because it is
                prose quoted from the site rather than a figure this page
                computed, so a `¤` added to it later still renders. */}
            <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
              {money(PRICING.smallPrint, LIST_CURRENCY)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The period end, only when it is a date that parses.
 *
 * It arrives from free-form JSON, so `new Date(...)` can be an Invalid Date —
 * which `toLocaleDateString` renders as the literal string "Invalid Date" on a
 * billing screen. An unparseable value is left unsaid instead.
 */
function periodEndSentence(periodEnd: string | null): string {
  if (!periodEnd) return ".";
  const parsed = new Date(periodEnd);
  if (Number.isNaN(parsed.getTime())) return ".";
  return `, current period ending ${parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  })}.`;
}
