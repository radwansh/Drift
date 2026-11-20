import { type Entitlement } from "@/lib/entitlement";

/**
 * The paywall that covers the app once a trial or subscription has ended.
 *
 * **This file is a placeholder with the contract fixed, not the finished
 * component.** It is mounted by `app/(main)/layout.tsx` so the layout never has
 * to change again while the dialog is built; whoever builds it changes this
 * file and nothing above it.
 *
 * What it has to be, from the brief:
 *
 * - **Not closeable.** No close button; Escape, a click outside and the back
 *   button do not dismiss it. Built on `components/ui/alert-dialog.tsx`
 *   (Radix), preventing `onEscapeKeyDown`, `onPointerDownOutside` and
 *   `onInteractOutside`. `role="alertdialog"`, `aria-modal="true"`, labelled by
 *   its heading, focus moved to that heading, Tab trapped inside, the page
 *   behind `inert` and not scrolling.
 * - **Rendered from the server**, here in the layout, so it is present on the
 *   first paint and after any reload rather than appearing a beat later.
 * - **Not the security boundary.** Deleting it in the browser unlocks nothing,
 *   because `memberProcedure` refuses every data call on the same
 *   `entitlementOf()` answer. It exists so a customer reads a sentence instead
 *   of watching the app fail.
 * - `reason: "trial_ended"` heads "Your free trial has ended";
 *   `"subscription_ended"` heads "Your subscription has ended" and adds
 *   **Manage billing** when the portal is available.
 * - Starter and Growth cards with **Continue to payment**, opening
 *   `settings.getCheckout`'s link in the same tab. Enterprise and Bureau get
 *   **Talk to us**. A small **Sign out** either way.
 * - **A viewer sees no payment buttons**, only "Your company's free trial has
 *   ended. Ask your admin to choose a plan." `getCheckout` already withholds
 *   the URLs from a viewer server-side, so the two agree.
 * - After returning from Polar with `?checkout_id=`, it says "Payment received,
 *   activating your plan…" and polls `getBillingInfo` every 2–3 seconds for
 *   about 30 seconds. **It closes only when the entitlement says access** —
 *   that is, once the webhook has written the subscription — never on the
 *   redirect alone. After 30 seconds it stays open and says so.
 *
 * Until it is built this renders nothing, which is deliberate: a half-built
 * paywall that looks like a paywall but can be clicked past is worse than none,
 * and the server refuses the data either way.
 */
export function TrialPaywall({
  entitlement,
  role,
}: {
  entitlement: Entitlement;
  role: string | null;
}) {
  void entitlement;
  void role;
  return null;
}
