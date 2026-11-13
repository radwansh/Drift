import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One rung of the pricing ladder, on the in-app billing page.
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
    <Card className={cn(current && "border-primary ring-1 ring-primary")}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-xl">{name}</CardTitle>
            <CardDescription>{audience}</CardDescription>
          </div>
          {current ? (
            <Badge variant="default">Current plan</Badge>
          ) : (
            tag && highlighted && <Badge variant="secondary">{tag}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {founderPrice ? (
          /**
           * List price struck through beside the founder price, as the
           * marketing page has it. The `<s>` element rather than a
           * line-through class so the "was" price is announced as struck, and
           * each figure carries a visually hidden label because two prices
           * read out in sequence are meaningless.
           */
          <p className="flex flex-wrap items-baseline gap-2">
            {listPrice && (
              <s className="text-sm text-muted-foreground">
                <span className="sr-only">List price </span>
                {listPrice}
              </s>
            )}
            <span className="text-2xl font-bold tabular-nums">
              <span className="sr-only">Founder price </span>
              {founderPrice}
            </span>
            {interval && <span className="text-sm text-muted-foreground">{interval}</span>}
          </p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-bold">{listPrice ?? onRequest}</span>
            {listPrice && interval && (
              <span className="text-sm text-muted-foreground">{interval}</span>
            )}
          </p>
        )}
        {footnote && <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  );
}
