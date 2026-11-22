import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * The paywall dialog and the trial banner, read as source.
 *
 * **There is no DOM here.** `apps/web/vitest.config.ts` sets
 * `environment: "node"` and the repo has no jsdom and no React testing library,
 * so these are source assertions in the shape `test/billing-ui.test.ts` and
 * `test/annual-ui.test.ts` already use. What a source assertion can honestly
 * cover is a *structural* property — a prop that is passed, a prop that is
 * deliberately not — and that is what the paywall's "cannot be dismissed"
 * guarantee is made of. Clicking Escape and watching the dialog stay is a
 * Playwright check, and CLAUDE.md records that there are no browsers and no
 * baselines in this environment.
 *
 * The one thing worth more than a grep is pinned against the installed Radix
 * package rather than against our own file, because three of the dialog's
 * guarantees are Radix's behaviour and a version bump is what would quietly
 * remove them.
 */

const WEB_ROOT = path.resolve(import.meta.dirname, "..");

function read(relative: string): string {
  return fs.readFileSync(path.join(WEB_ROOT, relative), "utf8");
}

/** Comments are prose about the component, not the component. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const PAYWALL = "src/components/billing/trial-paywall.tsx";
const GATE = "src/components/billing/trial-gate.tsx";

describe("the paywall cannot be dismissed", () => {
  /**
   * The structural guarantee, and the strongest one available: `open` is the
   * literal `true` and there is no `onOpenChange`, so there is no closed state
   * for Escape, an outside click, a history entry or a stray handler to reach.
   * The component is mounted by the layout only while the server says there is
   * no access, so only the server can take it away.
   */
  it("passes open with no onOpenChange, so it has no closed state", () => {
    const code = stripComments(read(PAYWALL));
    expect(code).toContain("<AlertDialog open>");
    expect(code).not.toContain("onOpenChange");
    expect(code).not.toMatch(/\bsetOpen\b/);
    expect(code).not.toContain("AlertDialogCancel");
  });

  /** Radix leaves `onEscapeKeyDown` alone, so this handler is what stops Escape. */
  it("prevents onEscapeKeyDown itself", () => {
    const code = stripComments(read(PAYWALL));
    expect(code).toMatch(/onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/);
  });

  /**
   * The three guarantees that are Radix's, pinned against the installed package.
   *
   * `AlertDialogContent` hard-codes `onPointerDownOutside` and
   * `onInteractOutside` to `preventDefault()` **after** spreading the props it
   * was given — so a handler passed from our component is discarded, and
   * passing one would be theatre. That is why `trial-paywall.tsx` does not pass
   * them, and this is how we know the behaviour is there. A Radix version that
   * stopped doing it would fail here rather than silently make the dialog
   * dismissable by clicking the backdrop.
   */
  it("relies on Radix for outside-click dismissal and the alertdialog role", () => {
    const require = createRequire(path.join(WEB_ROOT, "package.json"));
    const resolved = require.resolve("@radix-ui/react-alert-dialog");
    const radix = fs.readFileSync(resolved, "utf8");

    expect(radix).toContain("onPointerDownOutside: (event) => event.preventDefault()");
    expect(radix).toContain("onInteractOutside: (event) => event.preventDefault()");
    expect(radix).toContain('role: "alertdialog"');

    // And our component does not pretend to do it itself.
    const code = stripComments(read(PAYWALL));
    expect(code).not.toContain("onPointerDownOutside");
    expect(code).not.toContain("onInteractOutside");
  });

  /**
   * Focus lands on the heading, not on a button. Radix would otherwise focus an
   * `AlertDialogCancel`, which this dialog deliberately does not have — so
   * without this the auto-focus would land on nothing and a screen reader would
   * start from the content container.
   */
  it("moves focus to the heading through onOpenAutoFocus", () => {
    const code = stripComments(read(PAYWALL));
    expect(code).toContain("onOpenAutoFocus={focusHeading}");
    expect(code).toContain("headingRef.current?.focus()");
    expect(code).toContain("tabIndex={-1}");
  });

  /** `inert` additionally removes the page behind from the focus order and hit-testing. */
  it("marks the page behind inert and stops it scrolling", () => {
    const code = stripComments(read(PAYWALL));
    expect(code).toContain('child.setAttribute("inert", "")');
    expect(code).toContain('element.removeAttribute("inert")');
    expect(code).toContain('document.body.style.overflow = "hidden"');
    // Restored, so a route change cannot leave the app unscrollable.
    expect(code).toContain("document.body.style.overflow = previousOverflow");
  });
});

describe("returning from Polar unlocks nothing", () => {
  /**
   * The rule that makes the paywall a paywall. `checkout_id` is a query
   * parameter anyone can type, so it may only change the words. What ends the
   * dialog is `router.refresh()` — the server layout re-reading
   * `companies.settings` and not mounting the component — which happens when the
   * webhook has written the subscription and not before.
   */
  it("closes only by asking the server again, never from the redirect", () => {
    const code = stripComments(read(PAYWALL));
    expect(code).toContain("checkout_id");
    expect(code).toContain("router.refresh()");
    // The refresh is gated on the server's own answer, not on the redirect.
    expect(code).toMatch(/billing\.data\?\.entitlement\.access === true/);
    expect(code).toMatch(/if \(access\) router\.refresh\(\)/);
  });

  it("polls getBillingInfo inside the brief's 2-3 seconds, for about 30", () => {
    const code = read(PAYWALL);
    const poll = /ACTIVATION_POLL_MS = ([\d_]+)/.exec(code);
    const window_ = /ACTIVATION_WINDOW_MS = ([\d_]+)/.exec(code);
    expect(poll).not.toBeNull();
    expect(window_).not.toBeNull();

    const pollMs = Number(poll![1]!.replace(/_/g, ""));
    const windowMs = Number(window_![1]!.replace(/_/g, ""));
    expect(pollMs).toBeGreaterThanOrEqual(2000);
    expect(pollMs).toBeLessThanOrEqual(3000);
    expect(windowMs).toBeGreaterThanOrEqual(25_000);
    expect(windowMs).toBeLessThanOrEqual(35_000);
  });

  it("keeps the dialog open after the window and says what to do", () => {
    const code = read(PAYWALL);
    expect(code).toContain("Payment received, activating your plan");
    expect(code).toContain("Your payment is being confirmed");
    expect(code).toContain("Refresh this page in a minute");
    expect(code).toContain("hello@clarivo-app.com");
  });
});

describe("what the paywall says", () => {
  it("heads a trial and a subscription differently", () => {
    const code = read(PAYWALL);
    expect(code).toContain("Your free trial has ended");
    expect(code).toContain("Your subscription has ended");
  });

  it("carries the brief's body sentence verbatim", () => {
    expect(read(PAYWALL)).toContain(
      "Choose a plan to keep using Clarivo. Your company's data is safe and nothing has been deleted.",
    );
  });

  /**
   * A viewer sees no payment buttons — not a disabled one — and the server
   * agrees, because `getCheckout` returns `url: null` for them
   * (`test/billing-checkout.test.ts`). `canCheckout` is read rather than the
   * role re-derived: two places deciding who may buy is how a button comes to
   * exist over a null URL.
   */
  it("reads canCheckout from the server rather than re-deriving the role", () => {
    const code = stripComments(read(PAYWALL));
    expect(code).toContain("checkout.data?.canCheckout === true");
    expect(code).toContain("Ask your admin to choose a plan.");
    // The role prop exists for the layout's call signature and is deliberately
    // unused for this decision.
    expect(code).toContain("void role;");
    expect(code).not.toMatch(/EDITOR_ROLES|PAY_DETAIL_ROLES/);
  });

  it("offers Starter and Growth with a checkout, and the other two by email", () => {
    const code = read(PAYWALL);
    expect(code).toContain('BUYABLE: readonly PlanId[] = ["starter", "growth"]');
    expect(code).toContain("Continue to payment");
    expect(code).toContain("Talk to us");
    expect(code).toContain("Sign out");
  });

  /** Figures come from `PRICING` through the shared ladder module, never retyped. */
  it("takes its prices from PRICING, not from a literal", () => {
    const code = read(PAYWALL);
    expect(code).toContain('from "@/components/settings/pricing-ladder"');
    expect(code).toContain("planPrice(rung.listMonthly, LIST_CURRENCY)");
    // No bare currency figure anywhere in the file.
    expect(stripComments(code)).not.toMatch(/[€$]\s?\d/);
  });

  /**
   * `onboarding_incomplete` also has `access: false` and does reach this
   * component — the layout only redirects when it resolved the account, so a
   * failed lookup falls through. Telling that person their trial has ended would
   * be a false statement caused by a database hiccup, and `withEntitlement`
   * deliberately does not refuse that reason either.
   */
  it("renders nothing for a reason the server does not refuse", () => {
    const code = stripComments(read(PAYWALL));
    expect(code).toMatch(
      /reason !== "trial_ended" && reason !== "subscription_ended"\) return null/,
    );
  });

  /** Only for an ended subscription, and only when Polar can really open one. */
  it("offers Manage billing only when the portal is available", () => {
    const code = stripComments(read(PAYWALL));
    expect(code).toMatch(
      /endedSubscription && billing\.data\?\.portalAvailable === true && <ManageBilling/,
    );
  });
});

describe("the trial banner", () => {
  it("appears in the last seven days and always on the billing page", () => {
    const code = read(GATE);
    expect(code).toContain("BANNER_FROM_DAYS_LEFT = 7");
    expect(code).toContain('BILLING_PATH = "/settings/billing"');
    expect(code).toContain("!onBillingPage && daysLeft > BANNER_FROM_DAYS_LEFT");
  });

  /**
   * "Days left" is a duration rounded up, so it has one authority —
   * `trialDaysLeft()` — and the banner takes it from the server rather than
   * keeping a second `Math.ceil` of its own.
   */
  it("takes the day count from trialDaysLeft rather than recomputing it", () => {
    const code = stripComments(read(GATE));
    expect(code).toContain("entitlement.trialDaysLeft");
    expect(code).not.toContain("Math.ceil");
    expect(stripComments(read("src/server/routers/settings.ts"))).toContain(
      "trialDaysLeft(settings as CompanySettings, now)",
    );
  });

  /**
   * The loop shape this guards: a refresh re-renders the tree, a re-rendered
   * query can fail again, and a FORBIDDEN about a *role* fails every time. The
   * refusal only prompts a re-check, and the server's answer decides.
   */
  it("re-checks with the server on a refusal, throttled, instead of refreshing blindly", () => {
    const code = stripComments(read(GATE));
    expect(code).toContain("RECHECK_THROTTLE_MS");
    expect(code).toContain("if (!fresh.entitlement.access) router.refresh()");
  });

  it("says the days left, and on the final day the time", () => {
    const code = read(GATE);
    expect(code).toContain("days left in your free trial");
    expect(code).toContain("Your free trial ends today at");
    expect(code).toContain("Choose a plan");
  });

  /**
   * The reader's own time zone, which is the whole reason the time is formatted
   * in the browser: a trial ending at 23:30 in Sydney is a different *day* in
   * Frankfurt, and the last day of a trial is when the figure is read carefully.
   * `undefined` as the locale is what makes `toLocaleTimeString` use theirs.
   */
  it("formats the final-day time in the user's own zone", () => {
    expect(stripComments(read(GATE))).toContain(
      "endsAt.toLocaleTimeString(undefined, { hour: \"numeric\", minute: \"2-digit\" })",
    );
  });

  it("shows a payment-failed banner while access continues", () => {
    const code = read(GATE);
    expect(code).toContain("entitlement.paymentFailed");
    expect(code).toContain("Your last payment failed");
    expect(code).toContain("Update your card");
  });

  /**
   * The timer never decides anything: it asks the server, which is the same
   * `entitlementOf()` answer `memberProcedure` refuses data with. A wrong clock
   * therefore costs one request and changes nothing.
   */
  it("refreshes from the server when the trial lapses rather than deciding itself", () => {
    const code = stripComments(read(GATE));
    expect(code).toContain("window.setTimeout");
    expect(code).toContain("router.refresh()");
    expect(code).toContain("MAX_TIMEOUT_MS");
    expect(code).not.toContain("entitlementOf(");
  });

  /** Mounted by the navbar, because the layout mounts the paywall only on no-access. */
  it("is rendered by the navbar, and the layout is untouched", () => {
    expect(read("src/components/shared/navbar.tsx")).toContain("<TrialGate />");
    const layout = read("src/app/(main)/layout.tsx");
    expect(layout).not.toContain("TrialGate");
    expect(layout).toContain("<TrialPaywall entitlement={entitlement} role={role} />");
  });
});
