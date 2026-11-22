import { redirect } from "next/navigation";
import { currentAccount } from "@/server/current-account";
import { onboardingCompleted } from "@/lib/entitlement";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

/**
 * The five-step onboarding.
 *
 * Its own route group, outside `(main)`, deliberately: onboarding has no
 * sidebar and no top bar, and putting it under `(main)` would make that
 * layout's redirect-to-onboarding a loop.
 *
 * `force-dynamic` for the same reason every page under `(main)` has it — this
 * one reads the signed-in account, and a statically rendered protected page has
 * already leaked a cached auth response in this product once.
 *
 * **The gating lives here; the five steps are a client component.** Each step
 * saves through a mutation on `server/routers/onboarding.ts`, so the flow has
 * to be interactive, and the two questions this page answers — is anybody
 * signed in, and is this company already set up — are server questions that
 * must be answered before any of it renders.
 *
 * The steps themselves, and why each is shaped as it is, are documented in
 * `components/onboarding/*` and in the router. In short: company basics, an
 * optional industry that promises nothing, the base currency (read-only once
 * payroll exists in it), the fiscal year's start **month**, and an optional
 * real Clerk invitation. Finish writes `onboardingCompletedAt`,
 * `trialStartedAt` and `trialEndsAt` in one statement and only if they are not
 * already set, so finishing twice can never restart or lengthen a trial.
 */
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const account = await currentAccount();
  if (!account) redirect("/sign-in");

  // Once onboarding is done this route sends the user on, so a bookmark or a
  // back button cannot reopen a finished flow and write over a live company.
  // `finish` refuses a second time on the server as well: this redirect is the
  // courtesy, not the guard.
  if (onboardingCompleted(account.settings)) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 px-4 py-16">
      <OnboardingFlow />
    </main>
  );
}
