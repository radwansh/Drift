import { Badge, Panel } from "@/components/cv";
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
  /** Formatted beta-founder price, where the plan has one. */
  founderPrice: string | null;
  /** The interval the two figures are per, e.g. "per month". */
  interval: string | null;
  /** What to show instead of a figure: `PRICING.enterprise.price`. */
  onRequest: string | null;
  /** The small line under the price: the founder badge, or Enterprise's note. */
  footnote: string | null;
  /** The plan the company is actually on, per `getBillingInfo`. */
  current?: boolean;
  /** `plan.highlighted` — the marketing site's emphasis, kept in step. */
  highlighted?: boolean;
  /** `plan.tag`, where the plan carries one. */
  tag?: string;
}

export function PlanCard({
  name,
  audience,
  listPrice,
  founderPrice,
  interval,
  onRequest,
  footnote,
  current,
  highlighted,
  tag,
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
      {founderPrice ? (
        /**
         * List price struck through beside the founder price, as the
         * marketing page has it. The `<s>` element rather than a
         * line-through class so the "was" price is announced as struck, and
         * each figure carries a visually hidden label because two prices
         * read out in sequence are meaningless.
         */
        <p className="m-0 flex flex-wrap items-baseline gap-2">
          {listPrice && (
            <s className="cv-num text-sm text-cv-ink-disabled">
              <span className="sr-only">List price </span>
              {listPrice}
            </s>
          )}
          <span className="cv-num text-2xl font-medium tracking-[-0.02em] text-cv-ink">
            <span className="sr-only">Founder price </span>
            {founderPrice}
          </span>
          {interval && <span className="text-sm text-cv-ink-subtle">{interval}</span>}
        </p>
      ) : (
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
      )}
      {footnote && (
        <p className="m-0 mt-2 text-[13px] leading-[18px] text-cv-ink-subtle">{footnote}</p>
      )}
    </Panel>
  );
}
