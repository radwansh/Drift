"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanCard } from "@/components/settings/billing-card";
import {
  LIST_CURRENCY,
  planDisplayName,
  pricingLadder,
} from "@/components/settings/pricing-ladder";
import { PRICING, SITE, money } from "@/components/marketing/content";
import { parsePlan } from "@/lib/plans";
import { trpc } from "@/lib/trpc";
import { CreditCard, FileText, TriangleAlert } from "lucide-react";

/**
 * Billing, from `settings.getBillingInfo`.
 *
 * What this page used to show, none of which came from anywhere: a
 * "Professional" plan at $299 marked Active, **four paid invoices**
 * (INV-001…004, at $299 and $199), "16 of 1,000" active employees, "3"
 * comparisons this month, a next billing date of Jul 1 2026, and a
 * $99 / $299 / Custom ladder with hand-written per-plan feature lists. The
 * marketing site says the product is free in beta, so this page told a
 * customer they had been charged about a thousand dollars they had not been
 * charged.
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
 * There is no payment-method panel and no "Manage subscription" button.
 * Neither this page nor the router knows a payment method, and
 * `settings.createBillingPortal` does not create a portal session — it returns
 * `https://billing.stripe.com/session/<subscription id>`, assembled by string
 * concatenation, or Stripe's home page when there is no subscription. A portal
 * session has to be created through Stripe's API, there is no Stripe
 * dependency in the repo to do that with, and no company has a subscription id
 * in the first place. A button here would point at something that does not
 * exist, which is the same invention as the four invoices.
 */
export default function BillingPage() {
  const billing = trpc.settings.getBillingInfo.useQuery();
  const ladder = pricingLadder();

  const plan = parsePlan(billing.data?.plan);
  const unrecognised = billing.data !== undefined && plan === null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Billing &amp; Subscription</h2>
        <p className="text-muted-foreground mt-1">Your plan, and what Clarivo costs</p>
      </div>

      {billing.isPending && <Skeleton className="h-44" />}

      {billing.error && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{billing.error.message}</AlertDescription>
        </Alert>
      )}

      {billing.data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              Current plan
            </CardTitle>
            {/* A plain div rather than `CardDescription`, which renders a
                `<p>`: `Badge` is a div, and a div inside a p is nesting the
                browser silently unwinds. */}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{planDisplayName(plan, billing.data.plan)}</span>
              <Badge variant={billing.data.status === "active" ? "success" : "secondary"}>
                {billing.data.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {plan === "free" && (
              /* The promise the site makes, in the terms it makes it — a
                 customer reading both must not find two stories. */
              <p>
                Clarivo is free while it is in beta, and no payment method is held. When billing
                starts, every company that joined during the beta pays the founder price below for
                24 months.
              </p>
            )}

            {unrecognised && (
              <p>
                This company is recorded on a plan this page does not publish. Nothing is billed
                through the app, so what applies is whatever was agreed directly.
              </p>
            )}

            {billing.data.subscriptionId === null ? (
              <p>No subscription on record, so there is nothing to renew or cancel.</p>
            ) : (
              <p>
                Subscription{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  {billing.data.subscriptionId}
                </code>
                {periodEndSentence(billing.data.periodEnd)}
              </p>
            )}

            <p>
              Billing is handled by a person rather than by this screen: write to{" "}
              <a className="underline" href={`mailto:${SITE.email}`}>
                {SITE.email}
              </a>{" "}
              to change plan, ask about an invoice, or close the account.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Invoices
          </CardTitle>
          <CardDescription>Nothing has been billed yet</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Four invented paid invoices stood here. There is no invoice source
              in this product, so the empty state is the whole truth — and a
              real state, not a placeholder for the table to come back to. */}
          <p className="text-sm text-muted-foreground">
            No invoices yet. Clarivo has not charged this company; invoices will appear here once
            billing starts.
          </p>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold">Plans</h3>
        <p className="text-muted-foreground mt-1 text-sm">By employee count, per company.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
            />
          ))}
        </div>

        <div className="mt-6 space-y-2">
          <h4 className="text-sm font-semibold">{PRICING.includesTitle}</h4>
          {/* One list for every plan, because that is how they are sold. The
              per-plan feature lists this page used to carry said the opposite
              — "10 comparisons/month" on Starter — and contradicted
              `PRICING.includes` as well as each other. */}
          <ul className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            {PRICING.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="pt-2 text-xs text-muted-foreground">{PRICING.sizeLine}</p>
          {/* The published terms, verbatim and in one place: VAT, cancellation,
              how long the founder price lasts. Through `money()` because it is
              prose quoted from the site rather than a figure this page
              computed, so a `¤` added to it later still renders. */}
          <p className="text-xs text-muted-foreground">
            {money(PRICING.smallPrint, LIST_CURRENCY)}
          </p>
        </div>
      </div>
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
