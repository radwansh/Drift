"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { Button, DriftStrip, Notice } from "@/components/cv";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PRICING } from "@/components/marketing/content";
import { LIST_CURRENCY, planPrice } from "@/components/settings/pricing-ladder";
import { type Entitlement } from "@/lib/entitlement";
import { parsePlan, type PlanId } from "@/lib/plans";
import { trpc } from "@/lib/trpc";

/**
 * The paywall that covers the app once a trial or subscription has ended.
 *
 * **It cannot be closed, and the mechanism is that it has no closed state.**
 * `open` is the literal `true` and no `onOpenChange` is passed, so there is
 * nothing for Escape, a click outside or a stray `setOpen` to flip. It is
 * mounted by `app/(main)/layout.tsx` only while `entitlementOf()` says the
 * company has no access, which means **the server decides when it goes away**:
 * this component cannot dismiss itself even by mistake. That is the strongest
 * form of the rule "it closes only when the entitlement says access", and it is
 * why the checkout poll below calls `router.refresh()` instead of `setOpen`.
 *
 * Where each accessibility guarantee actually comes from, because three of them
 * are Radix's and claiming them here would be wrong:
 *
 * - `role="alertdialog"` — Radix's `AlertDialogContent` sets it.
 * - `aria-modal="true"`, `aria-labelledby` (the title) and `aria-describedby`
 *   (the description) — Radix's underlying `DialogContent`, from the Title and
 *   Description parts below.
 * - **Tab trapped inside** — Radix wraps the content in a trapped `FocusScope`.
 * - **No outside dismissal** — Radix's `AlertDialogContent` hard-codes
 *   `onPointerDownOutside` and `onInteractOutside` to `preventDefault()`, and it
 *   sets them *after* spreading our props, so handlers passed from here are
 *   discarded. They are therefore not passed: a prop that looks load-bearing and
 *   is silently dropped is worse than none. `test/trial-paywall-ui.test.ts`
 *   pins the Radix behaviour this depends on.
 * - **Escape** — this one *is* ours. Radix leaves `onEscapeKeyDown` alone, so
 *   `preventDefault()` below is what stops it, in addition to there being no
 *   `onOpenChange` for Radix to call.
 * - **Focus on the heading** — ours, through `onOpenAutoFocus`. Radix would
 *   otherwise focus an `AlertDialogCancel`, and this dialog deliberately has
 *   none.
 * - **The page behind `inert` and not scrolling** — ours, in the effect below.
 *   Radix hides the rest of the page from assistive technology with
 *   `aria-hidden` and locks scrolling, but `inert` additionally takes those
 *   elements out of the focus order and out of hit-testing, which is the
 *   property worth having on a dialog that must not be worked around.
 *
 * **The back button does not dismiss it** for the same structural reason: every
 * route under `(main)` renders this layout, so navigating back lands on another
 * page that mounts the paywall again from the server's own entitlement answer.
 * There is no client-side open flag for a history entry to restore.
 *
 * **Not the security boundary.** Deleting it in the browser unlocks nothing:
 * `memberProcedure` refuses every data call and `/api/upload` answers 402, both
 * on the same `entitlementOf()` answer. It exists so a customer reads a sentence
 * instead of watching the app fail.
 */
export function TrialPaywall({
  entitlement,
  role,
}: {
  entitlement: Entitlement;
  role: string | null;
}) {
  /**
   * The two reasons the server refuses data, and nothing else.
   *
   * `onboarding_incomplete` also has `access: false`, and it **reaches this
   * component**: the layout only redirects to `/onboarding` when it resolved the
   * account, so a failed account lookup falls through with
   * `settings: undefined`, which reads as `onboarding_incomplete`. Telling that
   * person their free trial has ended would be a false statement caused by a
   * database hiccup — and `withEntitlement` deliberately does **not** refuse
   * that reason, so there is nothing to explain. Rendering nothing keeps this
   * dialog's claim and the server's behaviour the same claim.
   */
  const reason = entitlement.reason;
  if (reason !== "trial_ended" && reason !== "subscription_ended") return null;

  return <Paywall entitlement={entitlement} role={role} />;
}

/** How long the "activating your plan" poll keeps trying. */
const ACTIVATION_WINDOW_MS = 30_000;

/** Between polls. Inside the brief's 2–3 seconds. */
const ACTIVATION_POLL_MS = 2_500;

/** Where "Talk to us" goes, for the two plans that are quoted rather than bought. */
const CONTACT_EMAIL = "hello@clarivo-app.com";

/** The two plans with a checkout, in ladder order. Enterprise and Bureau are quoted. */
const BUYABLE: readonly PlanId[] = ["starter", "growth"];

function Paywall({ entitlement, role }: { entitlement: Entitlement; role: string | null }) {
  void role;
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /**
   * Whether we came back from Polar's checkout.
   *
   * Read from `window.location.search` in an effect rather than with
   * `useSearchParams()`: this component is rendered by a layout that wraps every
   * app route, and `useSearchParams` opts the whole subtree out of static
   * rendering unless it sits under its own Suspense boundary. The value is only
   * ever needed in the browser, so reading it in the browser costs nothing and
   * keeps a rendering constraint out of the layout.
   *
   * **It unlocks nothing.** `checkout_id` is a query parameter — anybody can
   * type one — so all it does is change the words and start the poll below. The
   * dialog still goes away only when the server's entitlement says access,
   * which happens when Polar's webhook has written the subscription. A paywall
   * that closed on its own redirect would be one anyone could walk through by
   * crafting a URL.
   */
  const [returnedFromCheckout, setReturnedFromCheckout] = useState(false);
  const [activationTimedOut, setActivationTimedOut] = useState(false);

  useEffect(() => {
    const checkoutId = new URLSearchParams(window.location.search).get("checkout_id");
    if (checkoutId !== null && checkoutId.length > 0) setReturnedFromCheckout(true);
  }, []);

  /**
   * The page behind, inert and unscrolled.
   *
   * Every direct child of `<body>` is marked except the one containing this
   * dialog — the Radix portal appends itself to `<body>`, so "the branch holding
   * the dialog" is exactly the child to skip, and finding it by `contains`
   * rather than by a class or an id means no selector to keep in step. Elements
   * that were already `inert` are left alone so the cleanup cannot un-inert
   * something that was not ours.
   */
  useEffect(() => {
    const dialog = contentRef.current;
    const marked: HTMLElement[] = [];
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (dialog !== null && child.contains(dialog)) continue;
      if (child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      marked.push(child);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      for (const element of marked) element.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  /**
   * `getCheckout` and `getBillingInfo`, both on `billingProcedure` — member
   * procedures *without* the entitlement gate, precisely so this dialog's own
   * buttons work for the company it is shown to. Gating them would be a lock
   * whose key is behind the lock.
   */
  const checkout = trpc.settings.getCheckout.useQuery(undefined, { retry: false });
  const billing = trpc.settings.getBillingInfo.useQuery(undefined, {
    retry: false,
    /**
     * Polls only while waiting for a payment to land, and only inside the
     * window. `false` stops react-query refetching at all, so the ordinary case
     * — a company that has not paid and is reading the plans — makes one request
     * and then sits still.
     */
    refetchInterval: returnedFromCheckout && !activationTimedOut ? ACTIVATION_POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  /**
   * The server granted access, so leave.
   *
   * `router.refresh()` and not `setOpen(false)`: the layout re-renders on the
   * server, reads `companies.settings` again, and simply does not mount this
   * component. So the thing that takes the paywall away is the same
   * `entitlementOf()` call that put it there, and the webhook writing the
   * subscription is the only event that can cause it. Nothing in the browser can
   * decide the company has paid.
   */
  const access = billing.data?.entitlement.access === true;
  useEffect(() => {
    if (access) router.refresh();
  }, [access, router]);

  /** After the window, stop polling and say what to do. The dialog stays. */
  useEffect(() => {
    if (!returnedFromCheckout) return;
    const timer = window.setTimeout(() => setActivationTimedOut(true), ACTIVATION_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [returnedFromCheckout]);

  const focusHeading = useCallback((event: Event) => {
    // Stops Radix's own auto-focus (which targets an AlertDialogCancel this
    // dialog does not have) and puts the caret on the sentence instead, so a
    // screen-reader user hears the heading first rather than a button.
    event.preventDefault();
    headingRef.current?.focus();
  }, []);

  const endedSubscription = entitlement.reason === "subscription_ended";
  const heading = endedSubscription
    ? "Your subscription has ended"
    : "Your free trial has ended";

  /**
   * `canCheckout` comes from the server, which already withheld every URL from
   * a viewer. The role prop is deliberately **not** re-derived here: two places
   * deciding who may buy is how a button comes to exist over a null URL.
   */
  const canCheckout = checkout.data?.canCheckout === true;
  const configured = checkout.data?.configured === true;

  return (
    <AlertDialog open>
      <AlertDialogContent
        ref={contentRef}
        // Ours: Radix leaves this handler alone, so this is what stops Escape.
        onEscapeKeyDown={(event) => event.preventDefault()}
        onOpenAutoFocus={focusHeading}
        className="max-w-xl gap-4"
      >
        <AlertDialogTitle asChild>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="m-0 text-[20px] font-semibold leading-7 tracking-[-0.01em] text-cv-ink outline-none"
          >
            {heading}
          </h2>
        </AlertDialogTitle>

        <AlertDialogDescription className="text-sm leading-5 text-cv-ink-muted">
          {canCheckout
            ? "Choose a plan to keep using Clarivo. Your company's data is safe and nothing has been deleted."
            : `Your company's ${endedSubscription ? "subscription" : "free trial"} has ended. Ask your admin to choose a plan.`}
        </AlertDialogDescription>

        {returnedFromCheckout && !activationTimedOut && (
          <Notice tone="info" title="Payment received, activating your plan…">
            <div className="flex items-center gap-2">
              <DriftStrip size="sm" count={12} animate="scan" label="Waiting for Polar" />
              <span>This usually takes a few seconds.</span>
            </div>
          </Notice>
        )}

        {returnedFromCheckout && activationTimedOut && (
          <Notice tone="warning" title="Your payment is being confirmed">
            Refresh this page in a minute, or email{" "}
            <a className="text-cv-ink underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </Notice>
        )}

        {/* A viewer sees no payment buttons at all — not a disabled one. The
            server agrees: every `url` in `getCheckout` is null for them. */}
        {canCheckout && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {BUYABLE.map((plan) => (
                <PlanCard
                  key={plan}
                  plan={plan}
                  url={checkout.data?.plans.find((entry) => entry.plan === plan)?.url ?? null}
                />
              ))}
            </div>

            {!configured && (
              /* No plan has a `POLAR_CHECKOUT_LINK_<PLAN>` on this deployment,
                 so there is nothing to click. Said plainly rather than shown as
                 two cards with dead buttons. */
              <Notice tone="warning" title="Checkout is not available on this deployment">
                Email{" "}
                <a
                  className="text-cv-ink underline underline-offset-2"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                and a plan will be set up directly.
              </Notice>
            )}

            <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
              {PRICING.enterprise.name} ({PRICING.enterprise.for.toLowerCase()}) and{" "}
              {PRICING.bureau.name} are quoted rather than listed.{" "}
              <a
                className="text-cv-accent underline underline-offset-2"
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Clarivo: Enterprise or Bureau plan")}`}
              >
                Talk to us
              </a>
              .
            </p>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cv-line pt-4">
          <SignOutButton redirectUrl="/login">
            <Button variant="ghost" size="sm">
              Sign out
            </Button>
          </SignOutButton>

          {/* Only for an ended subscription, and only when Polar can really open
              a portal: `portalAvailable` needs both an access token on this
              deployment and a Polar customer recorded against this company. */}
          {endedSubscription && billing.data?.portalAvailable === true && <ManageBilling />}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * One buyable plan: its name, the band it is sold by, its list price, and the
 * link Polar gave us.
 *
 * Every word and figure comes from `PRICING` through
 * `components/settings/pricing-ladder.ts`, never retyped — CLAUDE.md's rule, and
 * the reason the in-app billing page reads the same module. The figure is
 * formatted with `currencyDisplay: "code"` like every other amount in the app,
 * so it reads `EUR 29.00`.
 *
 * **The price above the button is a list price, not a promise about the charge.**
 * `getCheckout` states no figure; what a plan costs is whatever Polar's checkout
 * says when it opens, which is why the caption says so.
 */
function PlanCard({ plan, url }: { plan: PlanId; url: string | null }) {
  const rung = [...PRICING.plans].find((candidate) => parsePlan(candidate.name) === plan);
  if (rung === undefined) return null;
  const price = planPrice(rung.listMonthly, LIST_CURRENCY);

  return (
    <div className="flex flex-col gap-2 rounded-cv-lg border border-cv-line bg-cv-surface p-4">
      <div>
        <p className="m-0 text-[15px] font-semibold leading-[22px] text-cv-ink">{rung.name}</p>
        <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">{rung.for}</p>
      </div>
      {price !== null && (
        <p className="m-0 font-cv-mono text-[15px] leading-[22px] tabular-nums text-cv-ink">
          {price}
          <span className="font-cv-sans text-[13px] text-cv-ink-subtle"> per month</span>
        </p>
      )}
      {url === null ? (
        <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
          No checkout configured for this plan.
        </p>
      ) : (
        /* A real anchor, same tab, no `target`: Polar's checkout wants the whole
           window, and a popup is the thing a browser blocks. */
        <Button href={url} variant="primary" size="sm">
          Continue to payment
        </Button>
      )}
      <p className="m-0 text-[12px] leading-[18px] text-cv-ink-subtle">
        The price is confirmed at checkout.
      </p>
    </div>
  );
}

/**
 * "Manage billing", for a company whose subscription ended rather than its
 * trial.
 *
 * `createBillingPortal` is a `billingEditorProcedure` — ungated on entitlement
 * for this exact button, role-checked all the same — and returns a real Polar
 * customer-session URL or `{ url: null }`. A null is a normal answer and gets a
 * sentence, never a dead link.
 */
function ManageBilling() {
  const portal = trpc.settings.createBillingPortal.useMutation({
    onSuccess: (result) => {
      if (result.url) window.location.href = result.url;
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={portal.isPending}
        onClick={() => portal.mutate({})}
      >
        Manage billing
      </Button>
      {(portal.data?.url === null || portal.error) && (
        <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
          Polar could not open a billing session just now.
        </p>
      )}
    </div>
  );
}
