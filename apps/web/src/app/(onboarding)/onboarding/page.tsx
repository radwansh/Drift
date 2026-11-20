import { redirect } from "next/navigation";
import { currentAccount } from "@/server/current-account";
import { onboardingCompleted } from "@/lib/entitlement";

/**
 * The five-step onboarding.
 *
 * **This file is a placeholder with the routing settled, not the finished
 * flow.** It exists so `app/(main)/layout.tsx`'s redirect has somewhere to land
 * and nobody is locked out while the steps are built; whoever builds them
 * changes this file and the route group under it, and nothing above.
 *
 * Its own route group, outside `(main)`, deliberately: onboarding has no
 * sidebar and no top bar, and putting it under `(main)` would make the layout's
 * redirect-to-onboarding a loop.
 *
 * `force-dynamic` for the same reason every page under `(main)` has it — this
 * one reads the signed-in account, and a statically rendered protected page has
 * already leaked a cached auth response in this product once.
 *
 * What it has to become, from the brief:
 *
 * 1. **Company basics** — name (2–200 chars, replaces `ensureUser`'s
 *    `"<name>'s company"` placeholder, saved to `companies.name`) and country
 *    (searchable ISO 3166 list, saved to `settings.country` as two letters).
 * 2. **Industry**, optional, from the thirteen-item list, saved to
 *    `settings.industry`. No promise of insights or benchmarks: there are none.
 * 3. **Base currency**, required, pre-selected from the country (AU→AUD,
 *    US→USD, euro area→EUR, GB→GBP, else USD), saved to
 *    `companies.currency_code`. **Read-only once the company has a payroll
 *    period**, so existing figures are never relabelled.
 * 4. **Fiscal year start** — month only, because
 *    `packages/payroll-core/src/annual/fiscal.ts` models a start month and the
 *    annual engine has no notion of a day. Australia→July, else January. Saved
 *    through the same path as `annual.setFiscalStartMonth`, which bounds the
 *    month and clears the summary memo; `routers/settings.ts` refuses
 *    `fiscalStartMonth` by name, so it must not be written directly.
 * 5. **Invite your accountant**, optional, with an "I'll do this later"
 *    checkbox. Accountant = `manager`, Viewer = `viewer` — and the Viewer copy
 *    has to say it sees employee-level pay on the Dashboard and Detailed View,
 *    because `comparisons.getById` gives viewers exactly that. It must send a
 *    real Clerk invitation: `auth.inviteUser` today inserts a `users` row and
 *    sends nothing.
 *
 * Each **Continue** saves its step through an `editorProcedure` that also
 * requires `admin`. A refresh resumes at the first incomplete step and **Back**
 * keeps what was entered. "Step N of 5", a stepper, `aria-current="step"`.
 *
 * **Finish** sets `onboardingCompletedAt`, `trialStartedAt` and `trialEndsAt`
 * in one statement through `server/company-settings.ts`, **only if they are not
 * already set**, so finishing twice can never restart or lengthen a trial —
 * then schedules the trial-ended email and redirects to `/dashboard`.
 */
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const account = await currentAccount();
  if (!account) redirect("/sign-in");

  // Once onboarding is done this route sends the user on, so a bookmark or a
  // back button cannot reopen a finished flow and write over a live company.
  if (onboardingCompleted(account.settings)) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 px-4 py-16">
      <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em] text-cv-ink">
        Let&apos;s set up your company
      </h1>
      <p className="m-0 text-base leading-relaxed text-cv-ink-muted">
        This is where the five onboarding steps go. They are not built yet.
      </p>
    </main>
  );
}
