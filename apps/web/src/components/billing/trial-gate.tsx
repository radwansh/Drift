"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Notice } from "@/components/cv";
import { trpc } from "@/lib/trpc";

/**
 * The in-app trial banner, and the thing that makes the paywall appear without
 * a reload.
 *
 * **Why it is here and not in the layout.** `app/(main)/layout.tsx` mounts
 * `TrialPaywall` only while the server says the company has *no* access — so a
 * tab that was opened with a live trial has no paywall in it to wake up when the
 * trial lapses. Something that is always mounted has to notice. This component
 * is it, rendered by `components/shared/navbar.tsx`, which the layout renders on
 * every route under `(main)`. The layout itself is untouched.
 *
 * **It never decides anything itself; it asks the server again.** When the timer
 * fires, or when a tRPC call is refused, it calls `router.refresh()`. The layout
 * re-renders on the server, reads `companies.settings`, and mounts the paywall
 * from the same `entitlementOf()` answer that `memberProcedure` refuses data
 * with. So a clock that is wrong, or a refusal that was about a role rather than
 * a payment, costs one server round trip and changes nothing — where a
 * client-side "the trial has expired, show the wall" would be a second opinion
 * able to disagree with the server in both directions.
 *
 * **One query, shared.** `settings.getBillingInfo` is a `billingProcedure` —
 * ungated on entitlement, so it answers for an expired company — and carries the
 * entitlement. The paywall reads the same procedure, so react-query holds one
 * cache entry between them and this banner costs no second request.
 */

/** The banner appears this far out. The brief's "last 7 days". */
const BANNER_FROM_DAYS_LEFT = 7;

/** The billing page, where the banner always shows regardless of days left. */
const BILLING_PATH = "/settings/billing";

/**
 * `setTimeout` fires **immediately** for a delay over 2^31−1 ms (about 24.9
 * days) rather than waiting, which here would mean refreshing in a loop. A
 * 14-day trial is comfortably inside it; the guard is for a `trialEndsAt` that
 * is not, since it is read from a free-form jsonb column.
 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * The react-query key prefix for `settings.getBillingInfo`, which tRPC shapes as
 * `[[router, procedure], …]`. A prefix match is what invalidates it whatever
 * input descriptor is appended.
 */
const BILLING_QUERY_KEY = [["settings", "getBillingInfo"]] as const;

/** At most one entitlement re-check per refused call in this window. */
const RECHECK_THROTTLE_MS = 5_000;

export function TrialGate() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const lastRecheck = useRef(0);

  const billing = trpc.settings.getBillingInfo.useQuery(undefined, {
    retry: false,
    // One request per session on a quiet page; the paywall sets its own
    // refetchInterval while it is waiting for a payment to land.
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const entitlement = billing.data?.entitlement;
  const trialEndsAt = entitlement?.trialEndsAt ?? null;
  const hasAccess = entitlement?.access ?? true;

  /**
   * The lapse timer.
   *
   * Set to the exact millisecond the trial ends rather than polling: a trial
   * that ends at 14:32 should put the dialog up at 14:32, and an interval that
   * caught it within a minute would be a minute of a customer entering payroll
   * data the server has already started refusing.
   *
   * `setTimeout` is capped at 2^31−1 ms (about 24.9 days), and a value over it
   * fires immediately — which would refresh in a loop. A trial is 14 days, so a
   * fresh one is inside the cap, but the delay is clamped anyway: this reads
   * `trialEndsAt` out of a free-form jsonb column, and nothing here should
   * depend on what is in it being sane.
   *
   * It fires once. `fired` is a ref rather than state so a re-render cannot
   * re-arm it, and it is reset when a *new* end date arrives — which happens
   * when the refresh comes back with a subscription, or not at all.
   */
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (trialEndsAt === null || !hasAccess) return;
    if (fired.current === trialEndsAt) return;

    const endsAt = new Date(trialEndsAt).getTime();
    if (Number.isNaN(endsAt)) return;

    const remaining = endsAt - Date.now();
    if (remaining > MAX_TIMEOUT_MS) return;

    const timer = window.setTimeout(() => {
      fired.current = trialEndsAt;
      // Ask the server. It, not this timer, decides whether access has gone.
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      router.refresh();
    }, Math.max(remaining, 0));
    return () => window.clearTimeout(timer);
  }, [trialEndsAt, hasAccess, router, queryClient]);

  /**
   * A refused call, re-checked against the server.
   *
   * The brief asks for the paywall to open "whenever any tRPC call fails with
   * `cause: "PAYMENT_REQUIRED"`". **That cause does not reach the browser.**
   * tRPC's default error shape (`getErrorShape` in @trpc/server 11.18) carries
   * `message`, `code`, `data.code` and `data.httpStatus` and nothing else — a
   * `TRPCError`'s `cause` is deliberately server-only, and widening the shape
   * means editing `server/trpc.ts`'s `errorFormatter`, which is outside this
   * change.
   *
   * So the trigger is the broader, duller fact that *is* on the wire — a
   * FORBIDDEN — and the answer still comes from the server: refetch the
   * entitlement and refresh. A FORBIDDEN that was about a role instead of a
   * payment costs one request and puts up nothing, because `getBillingInfo`
   * reports access. Matching the refusal's message text would be the narrower
   * filter and was rejected: it would couple this component to two sentences in
   * `withEntitlement` that it does not own.
   *
   * Subscribing to the query cache rather than adding a tRPC link keeps this out
   * of `app/providers.tsx`: one `useEffect` here sees every query and mutation
   * error in the app.
   */
  useEffect(() => {
    const onError = (error: unknown) => {
      const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
      if (code !== "FORBIDDEN") return;

      /**
       * Throttled, because this is a loop shape: refresh re-renders the tree, a
       * re-rendered query can fail again, and a FORBIDDEN that is about a role
       * will fail every single time. One re-check every few seconds is all a
       * lapse needs, and it makes the loop impossible rather than unlikely.
       */
      const sinceLast = Date.now() - lastRecheck.current;
      if (sinceLast < RECHECK_THROTTLE_MS) return;
      lastRecheck.current = Date.now();

      /**
       * **The server answers, not the error.** The refusal is only a prompt to
       * ask again: the entitlement is refetched and the layout is refreshed only
       * if it really says there is no access. A role refusal therefore costs one
       * request and puts up nothing.
       */
      void (async () => {
        try {
          await utils.settings.getBillingInfo.invalidate();
          const fresh = await utils.settings.getBillingInfo.fetch();
          if (!fresh.entitlement.access) router.refresh();
        } catch {
          // The one endpoint that would have told us is itself unreachable.
          // Nothing is asserted on a failed lookup.
        }
      })();
    };

    const queries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.state.status === "error") {
        onError(event.query.state.error);
      }
    });
    const mutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.mutation?.state.status === "error") {
        onError(event.mutation.state.error);
      }
    });

    return () => {
      queries();
      mutations();
    };
  }, [queryClient, router, utils]);

  // No access: the paywall is up (or about to be, after the refresh above), and
  // a banner behind a modal is noise.
  if (entitlement === undefined || !entitlement.access) return null;

  if (entitlement.paymentFailed) return <PaymentFailedBanner />;

  if (entitlement.reason !== "trialing" || trialEndsAt === null) return null;
  if (entitlement.trialDaysLeft === null) return null;

  return (
    <TrialBanner
      trialEndsAt={trialEndsAt}
      daysLeft={entitlement.trialDaysLeft}
      onBillingPage={pathname === BILLING_PATH}
    />
  );
}

/**
 * "N days left in your free trial · Choose a plan", and on the last day the hour
 * it ends.
 *
 * **The count comes from the server and the time from the browser**, and the
 * split is the point. "Days left" is a duration rounded up, so
 * `trialDaysLeft()` in `lib/entitlement.ts` gives the same answer wherever it
 * runs and is the single authority for the rounding — a second
 * `Math.ceil(ms / 86400000)` here would be a copy that agrees until one of them
 * is edited. The *time of day* genuinely depends on the reader: a trial ending
 * at 23:30 in Sydney is the 14th there and the 13th in Frankfurt, and the last
 * day of a trial is the one moment the figure is read carefully.
 * `toLocaleTimeString` with no locale uses the browser's, so it is the reader's
 * clock and their 12- or 24-hour habit.
 */
function TrialBanner({
  trialEndsAt,
  /** From `trialDaysLeft()`, through `getBillingInfo`. Never recomputed here. */
  daysLeft,
  /**
   * On the billing page the banner shows however many days are left — the brief
   * asks for it there always — and drops its "Choose a plan" button, because the
   * plans are the page it would link to.
   */
  onBillingPage,
}: {
  trialEndsAt: string;
  daysLeft: number;
  onBillingPage: boolean;
}) {
  const endsAt = new Date(trialEndsAt);
  if (Number.isNaN(endsAt.getTime())) return null;
  if (daysLeft <= 0) return null;
  if (!onBillingPage && daysLeft > BANNER_FROM_DAYS_LEFT) return null;

  const days = daysLeft;
  const finalDay = days <= 1;
  const time = endsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div className="px-4 pt-4 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-content">
        <Notice
          tone={finalDay ? "warning" : "info"}
          action={
            onBillingPage ? undefined : (
              <Button href={BILLING_PATH} variant="secondary" size="sm">
                Choose a plan
              </Button>
            )
          }
        >
          {finalDay
            ? `Your free trial ends today at ${time}.`
            : `${days} days left in your free trial.`}
        </Notice>
      </div>
    </div>
  );
}

/**
 * The card failed and the company still has access.
 *
 * `paymentFailed` is true for `past_due` only — `entitlementOf` keeps access on
 * a failed charge rather than taking the app away from a customer who meant to
 * pay — so this is a banner and never a paywall. "Update your card" goes to the
 * billing page, where "Manage billing" opens Polar's portal when there is one.
 */
function PaymentFailedBanner() {
  return (
    <div className="px-4 pt-4 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-content">
        <Notice
          tone="danger"
          title="Your last payment failed"
          action={
            <Button href={BILLING_PATH} variant="secondary" size="sm">
              Update your card
            </Button>
          }
        >
          Clarivo still works. Update your card to keep it that way.
        </Notice>
      </div>
    </div>
  );
}
