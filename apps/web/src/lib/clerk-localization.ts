import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

/**
 * Clerk's own type for the prop, read off the component rather than imported
 * from `@clerk/types` — which is not a dependency of this app and so is not
 * resolvable under pnpm. `clerk-appearance.ts` reads `appearance` the same way.
 */
type ClerkLocalization = NonNullable<ComponentProps<typeof ClerkProvider>["localization"]>;

/**
 * The words Clerk's prebuilt screens say, where the default is wrong for
 * Clarivo. Appearance lives next door in `clerk-appearance.ts`; this is the
 * copy, and the two are separate because one is tokens and one is voice.
 *
 * It is a `ClerkProvider` prop rather than a `<SignIn>` one: `SignInProps` has
 * `appearance` but no `localization`, so there is nowhere else to put it. The
 * object is a deep partial that Clerk merges over `enUS`, so only the keys
 * below change and every other string stays Clerk's.
 *
 * ## Why these four keys
 *
 * **Sign in must not create an account.** `<SignIn transferable={false}>` is
 * what stops it (see `app/(auth)/sign-in/[[...sign-in]]/page.tsx`), and these
 * are what the person then reads. Two codes mean "there is no account here",
 * one per path into the form:
 *
 * - `form_identifier_not_found` — an email typed into the form that matches no
 *   user. Clerk's default is "Couldn't find your account.", which reads as
 *   though the account exists and is misplaced.
 * - `external_account_not_found` — the OAuth path: a Google or Microsoft
 *   account that matches no user. This is the code the sign-in attempt's
 *   `firstFactorVerification.error` carries when an external account resolves
 *   to nobody, and it is the error a blocked transfer leaves on the card.
 *   Clerk's default is "This external account was not found."
 *
 * Both now say the same sentence, because to the person they are the same
 * event: the email they tried has no Clarivo account behind it. The cost of
 * aiming `external_account_not_found` at sign-in is that the same sentence
 * appears in UserProfile's connected-accounts flow, where it is vaguer than
 * Clerk's default — a signed-in edge case, traded for the signed-out one that
 * decides whether somebody gets an account by accident.
 *
 * **And it must send them somewhere.** `signIn.start.actionText` and
 * `actionLink` are the footer of the sign-in card, which Clerk points at
 * `signUpUrl` (`/sign-up`). They render in every state of the card, including
 * whatever error the OAuth path produces, so the way to an account is on screen
 * even when the error string above is not the one showing.
 *
 * Sentence case, no exclamation marks, per the design system's voice.
 */
export const clerkLocalization: ClerkLocalization = {
  signIn: {
    start: {
      actionText: "New to Clarivo?",
      actionLink: "Get started",
    },
  },
  unstable__errors: {
    form_identifier_not_found: "There's no Clarivo account for this email.",
    form_identifier_not_found__email_address: "There's no Clarivo account for this email.",
    external_account_not_found: "There's no Clarivo account for this email.",
  },
};
