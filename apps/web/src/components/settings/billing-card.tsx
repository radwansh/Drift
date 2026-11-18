import { Badge, Button, Panel } from "@/components/cv";
import { cn } from "@/lib/utils";

/**
 * One rung of the pricing ladder, on the in-app billing page, on Ink & Signal.
 *
 * This was `BillingCard`: a name, a `$299`, a hand-written feature list and a
 * CTA button with no `onClick` at all. The figures matched nothing — the
 * marketing site has sold Starter / Growth / Enterprise at 29 / 49 / on
 * request since PR #21 — and the per-plan feature lists contradicted
 * `PRICING.includes`, which says every plan includes every feature.
 *
 * So the features and the dead button are gone, and what is left is what a
 * plan actually differs by: who it is for, and what it costs. Every string
 * comes from `PRICING` in `components/marketing/content.ts`; see
 * `(main)/settings/billing/page.tsx` for why the figures are formatted with
 * `formatCurrency` here and with a bare symbol there.
 *
 * The figures are `cv-num` — Geist Mono, tabular — because the three cards sit
 * side by side and a proportional digit makes one price ride wider than the
 * next. The selected card is marked with a cobalt hairline and ring, the
 * design system's selection, not a filled ground: a plan card is not a status.
 */
interface PlanCardProps {
  name: string;
  /** `plan.for`: the employee band the plan is sold by. */
  audience: string;
  /** Formatted list price, or null for a plan that is priced on request. */
  listPrice: string | null;
  /** The interval the figure is per, e.g. "per month". */
  interval: string | null;
  /** What to show instead of a figure: `PRICING.enterprise.price`. */
  onRequest: string | null;
  /** The small line under the price: Enterprise's note, where it has one. */
  footnote: string | null;
  /** The plan the company is actually on, per `getBillingInfo`. */
  current?: boolean;
  /** `plan.highlighted` — the marketing site's emphasis, kept in step. */
  highlighted?: boolean;
  /** `plan.tag`, where the plan carries one. */
  tag?: string;
  /**
   * This plan's Polar checkout link, from `settings.getCheckout`, or null when
   * the plan has no `POLAR_CHECKOUT_LINK_<PLAN>` configured or the caller may
   * not buy. Null renders no button at all rather than a disabled one: a
   * control that cannot ever work is not a state, it is clutter.
   */
  checkoutUrl?: string | null;
}

export function PlanCard({
  name,
  audience,
  listPrice,
  interval,
  onRequest,
  footnote,
  current,
  highlighted,
  tag,
  checkoutUrl,
}: PlanCardProps) {
  return (
    <Panel
      title={name}
      description={audience}
      className={cn(current && "border-cv-accent ring-1 ring-cv-accent")}
      actions={
        current ? (
          <Badge tone="accent">Current plan</Badge>
        ) : (
          tag && highlighted && <Badge tone="accent">{tag}</Badge>
        )
      }
    >
      {/*
        One figure. There used to be two — the list price struck through
        beside a beta-founder price at half of it, each with a visually
        hidden label so a screen reader could tell them apart. The founder
        discount is gone from every market, so the branch, the `<s>` and both
        labels went with it: a lone price needs no label saying which it is.
      */}
      <p className="m-0 flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "text-2xl font-medium tracking-[-0.02em] text-cv-ink",
            // "On request" is a sentence, not a figure: mono and tabular
            // alignment are for digits, and applying them to words spaces
            // the letters like a price.
            listPrice && "cv-num",
          )}
        >
          {listPrice ?? onRequest}
        </span>
        {listPrice && interval && (
          <span className="text-sm text-cv-ink-subtle">{interval}</span>
        )}
      </p>
      {footnote && (
        <p className="m-0 mt-2 text-[13px] leading-[18px] text-cv-ink-subtle">{footnote}</p>
      )}
      {checkoutUrl && !current && (
        /**
         * `secondary`, not `primary`: up to three of these sit side by side and
         * none of them is "the one main action on the screen", which is what
         * the design system reserves Ink for. Never `accent` — cobalt is the
         * marketing site's sign-up call to action.
         *
         * The label names the destination and **states no price**. The figures
         * above it come from `PRICING`; what Polar charges comes from the
         * product behind the link, and in this repo today those are not the
         * same number. Writing "Upgrade for EUR 14.00" here would pick one of
         * three competing stories and put it on a button.
         */
        <div className="mt-4 flex flex-col gap-1.5">
          <Button href={checkoutUrl} variant="secondary" size="sm" iconRight="arrow-right">
            Continue to checkout
          </Button>
          <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
            Price, currency and tax are confirmed by Polar at checkout.
          </p>
        </div>
      )}
    </Panel>
  );
}
