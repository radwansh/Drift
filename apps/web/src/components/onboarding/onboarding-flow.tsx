"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  DriftStrip,
  Notice,
  PageHeader,
  Panel,
  PanelFoot,
  TextField,
} from "@/components/cv";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import {
  FISCAL_MONTH_HINTS,
  INDUSTRIES,
  MONTH_NAMES,
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  companyNameError,
  countryName,
  defaultCurrencyForCountry,
  defaultFiscalMonthForCountry,
  inviteEmailError,
  isPlaceholderCompanyName,
  type Industry,
  type InviteRole,
} from "@/lib/onboarding-options";
import { CountryField } from "./country-field";
import { InviteStep } from "./invite-step";
import { OnboardingStepper } from "./onboarding-stepper";

type State = RouterOutputs["onboarding"]["getState"];

/** The sentinel for "no industry": Radix forbids an empty SelectItem value. */
const NO_INDUSTRY = "__none__";

/**
 * The five-step onboarding.
 *
 * **Resuming is server state; the drafts are local.** The step to open on comes
 * from `stepsSaved`, which `routers/onboarding.ts` keeps on
 * `settings.onboardingStep` — a refresh therefore reopens the first step that
 * was never saved, not the first step. Back is pure client state, so going
 * back shows what was typed rather than what was stored, which is the whole
 * point of being able to go back.
 *
 * **Nothing here decides anything the server does not also decide.** The name
 * bounds, the country codes, the currency and fiscal-month defaults and the
 * two access levels all come from `lib/onboarding-options.ts`, which the router
 * validates against. The client checks are there so a refusal reads as a
 * sentence under the field instead of as a ZodError in a red box.
 */
export function OnboardingFlow() {
  const state = trpc.onboarding.getState.useQuery();

  if (state.isPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" aria-busy="true">
        <DriftStrip size="lg" count={24} animate="scan" label="Loading your company" />
        <p className="m-0 text-sm text-cv-ink-subtle">Loading your company</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <Notice tone="danger" title="Could not load your company">
        {state.error.message}
      </Notice>
    );
  }

  /**
   * **Deliberately unkeyed.** `(main)/settings/page.tsx` keys its form on the
   * company id so a background refetch cannot overwrite a half-typed field;
   * here the same instinct would do the opposite harm. The only values that
   * change between refetches are the ones the steps themselves write — the
   * name, the progress — so keying on any of them would remount the flow the
   * moment a window refocus refetched, throwing away the step being typed and
   * jumping the customer forward. Without a key the drafts are seeded once by
   * `useState` and a refetch merely refreshes what is read during render.
   */
  return <Steps state={state.data} />;
}

function Steps({ state }: { state: State }) {
  const router = useRouter();

  const [step, setStep] = useState(() =>
    Math.min(state.stepsSaved + 1, ONBOARDING_STEP_COUNT),
  );

  /**
   * Pre-filled with what the company already has, because a company that
   * existed before this release goes through these steps too. The one thing
   * not pre-filled is a placeholder name: `ensureUser` writes
   * `"<name>'s company"` or `"My company"`, and offering that as the answer
   * invites a Continue on a name nobody chose.
   */
  const [name, setName] = useState(() =>
    isPlaceholderCompanyName(state.name) ? "" : state.name,
  );
  const [country, setCountry] = useState<string | null>(state.country);
  const [industry, setIndustry] = useState<string>(state.industry ?? NO_INDUSTRY);
  const [currency, setCurrency] = useState(() =>
    state.country && state.stepsSaved < 3
      ? defaultCurrencyForCountry(state.country)
      : state.currencyCode,
  );
  const [month, setMonth] = useState(
    () => state.fiscalStartMonth ?? defaultFiscalMonthForCountry(state.country),
  );
  const [skipInvite, setSkipInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("manager");
  const [submitted, setSubmitted] = useState(false);

  const saveBasics = trpc.onboarding.saveCompanyBasics.useMutation();
  const saveIndustry = trpc.onboarding.saveIndustry.useMutation();
  const saveCurrency = trpc.onboarding.saveCurrency.useMutation();
  const saveMonth = trpc.onboarding.saveFiscalStartMonth.useMutation();
  const invite = trpc.onboarding.inviteAccountant.useMutation();
  const finish = trpc.onboarding.finish.useMutation();

  const busy =
    saveBasics.isPending ||
    saveIndustry.isPending ||
    saveCurrency.isPending ||
    saveMonth.isPending ||
    invite.isPending ||
    finish.isPending;

  if (!state.isAdmin) {
    /**
     * `(main)/layout.tsx` redirects **every** member of a company with no
     * `onboardingCompletedAt` here, not only its admin — which for a company
     * that predates this release means a manager or a viewer can land on this
     * page. Every mutation below is admin-only, so they are told who has to
     * finish it rather than shown a form that refuses them on Continue.
     */
    return (
      <Panel title="Your company is still being set up">
        <Notice tone="info" title="An admin has to finish this">
          {/* The name is only used when it is a real one: a company still on
              `ensureUser`'s placeholder would read "My company has not
              finished setting up Clarivo." */}
          <p>
            {isPlaceholderCompanyName(state.name) ? "Your company" : state.name} has not finished
            setting up Clarivo. Ask an admin on your company to complete the five setup steps;
            everything opens up for everybody once they have.
          </p>
        </Notice>
      </Panel>
    );
  }

  const nameError = submitted ? companyNameError(name) : null;
  const emailError =
    submitted && !skipInvite ? inviteEmailError(email, state.ownEmail) : null;

  /** Whether Continue can do anything, checked before it is pressed. */
  function canContinue(): boolean {
    if (step === 1) return companyNameError(name) === null && country !== null;
    if (step === 3) return /^[A-Za-z]{3}$/.test(currency);
    if (step === 5) return skipInvite || inviteEmailError(email, state.ownEmail) === null;
    return true;
  }

  async function onContinue() {
    setSubmitted(true);
    if (!canContinue()) return;

    try {
      if (step === 1) {
        await saveBasics.mutateAsync({ name: name.trim(), country: country! });
        // The later steps' defaults follow the country, so they are re-seeded
        // from it here rather than kept from an earlier country's answer.
        if (state.stepsSaved < 3) setCurrency(defaultCurrencyForCountry(country));
        if (state.fiscalStartMonth === null) setMonth(defaultFiscalMonthForCountry(country));
      } else if (step === 2) {
        await saveIndustry.mutateAsync({
          industry: industry === NO_INDUSTRY ? null : (industry as Industry),
        });
      } else if (step === 3) {
        await saveCurrency.mutateAsync({ currencyCode: currency });
      } else if (step === 4) {
        await saveMonth.mutateAsync({ month });
      } else {
        /**
         * Not re-sent if this exact address already went out. Step 5 is two
         * mutations — invite, then finish — so a finish that fails after a
         * successful invitation leaves Finish to be pressed again, and
         * re-inviting would then be refused by the router's own
         * "already on your company" check and strand the customer on the last
         * step. Comparing the address rather than just the success flag means
         * correcting a typo still sends to the new one.
         */
        const alreadySent =
          invite.isSuccess && invite.data?.email === email.trim().toLowerCase();
        if (!skipInvite && !alreadySent) {
          await invite.mutateAsync({ email: email.trim().toLowerCase(), role });
        }
        await finish.mutateAsync();
        // Invalidate the client router cache before navigating: the app layout
        // decides whether to redirect here from the server, and a cached RSC
        // payload taken before the trial existed would bounce straight back.
        router.refresh();
        router.push("/dashboard");
        return;
      }
      setSubmitted(false);
      setStep((current) => Math.min(current + 1, ONBOARDING_STEP_COUNT));
    } catch {
      // The failing mutation holds its own error and the step renders it. A
      // rejection must not advance the step: a saved step and a shown step
      // that disagree is how a value silently never lands.
    }
  }

  /**
   * Only the current step's refusal, not the first one found among all five: a
   * step that failed, was corrected and left behind must not keep its red
   * notice on a later screen. Step 5's invitation error is rendered by
   * `InviteStep` instead, beside the field it belongs to.
   */
  const stepError = [saveBasics, saveIndustry, saveCurrency, saveMonth, finish][step - 1]!
    .error;

  const label = ONBOARDING_STEPS[step - 1]!.label;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Set up Clarivo"
        title={step === 1 ? "Let's set up your company" : label}
        lede={
          step === 1
            ? "Five short steps. Your 14-day trial starts when you finish, not now."
            : undefined
        }
      />

      <OnboardingStepper current={step} />

      <Panel title={label} description={DESCRIPTIONS[step - 1]}>
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <TextField
              id="onboarding-company-name"
              label="Company name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError ?? undefined}
              hint={nameError ? undefined : "As it should appear on every screen and export."}
              autoComplete="organization"
            />
            <CountryField value={country} onChange={setCountry} />
            {submitted && country === null && (
              <p className="m-0 text-[13px] leading-[18px] text-cv-danger-ink">
                Choose the country the company runs payroll in.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="onboarding-industry"
              className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink"
            >
              Industry
            </label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger id="onboarding-industry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_INDUSTRY}>No industry</SelectItem>
                {INDUSTRIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">Optional.</p>
            {/*
              No benchmarks are promised because there are none: nothing in the
              product reads this key today. Saying so is better than a vague
              "helps us tailor Clarivo", which is a promise.
            */}
            <p className="m-0 mt-1.5 text-[13px] leading-[18px] text-cv-ink-subtle">
              Clarivo does not publish industry benchmarks or comparisons, and no screen changes
              based on your answer.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-[15px] leading-6 text-cv-ink-muted">
              Clarivo shows your payroll figures in this currency. Upload payroll files in this
              currency.
            </p>

            {state.currencyLocked ? (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-[13px] font-medium leading-[18px] text-cv-ink">
                  Base currency
                </p>
                <p className="m-0 font-cv-mono text-[15px] leading-6 text-cv-ink">
                  {state.currencyCode}
                </p>
                <Notice tone="info" title="This is fixed now">
                  You have already uploaded payroll in {state.currencyCode}. Clarivo converts
                  nothing, so changing the base currency would relabel figures that were never
                  paid in it.
                </Notice>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="onboarding-currency"
                  className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink"
                >
                  Base currency
                </label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="onboarding-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions(currency).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {country && (
                  <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                    Suggested from {countryName(country)}. Change it if your payroll is paid in
                    something else.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="onboarding-fiscal-month"
                className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink"
              >
                Fiscal year starts in
              </label>
              <Select
                value={String(month)}
                onValueChange={(next) => setMonth(Number(next))}
              >
                <SelectTrigger id="onboarding-fiscal-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((monthName, index) => {
                    const value = index + 1;
                    return (
                      <SelectItem key={value} value={String(value)}>
                        {FISCAL_MONTH_HINTS[value] ?? monthName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                {month === 1
                  ? "Your year totals run January to December."
                  : `Your year totals run ${MONTH_NAMES[month - 1]} to ${MONTH_NAMES[(month + 10) % 12]}.`}
              </p>
            </div>
            {/*
              A month and no day, because `annual/fiscal.ts` models a start
              month and the engine has no notion of a start day. A day collected
              here would be a number nothing could read.
            */}
            <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
              Clarivo works in whole months, so a year starts on the first of the month you pick.
            </p>
          </div>
        )}

        {step === 5 && (
          <InviteStep
            skip={skipInvite}
            onSkipChange={setSkipInvite}
            email={email}
            onEmailChange={setEmail}
            role={role}
            onRoleChange={setRole}
            emailError={emailError ?? undefined}
            failure={invite.error?.message}
          />
        )}

        {stepError && (
          <Notice tone="danger" title="That did not save" className="mt-5">
            {stepError.message}
          </Notice>
        )}

        <PanelFoot className="mt-6 rounded-b-cv-lg">
          <Button
            variant="secondary"
            disabled={step === 1 || busy}
            onClick={() => {
              setSubmitted(false);
              setStep((current) => Math.max(current - 1, 1));
            }}
          >
            Back
          </Button>

          <div className="flex items-center gap-3">
            {step === 2 && industry === NO_INDUSTRY && <Badge tone="neutral">Optional</Badge>}
            <Button loading={busy} disabled={busy} onClick={() => void onContinue()}>
              {step === ONBOARDING_STEP_COUNT ? "Finish" : "Continue"}
            </Button>
          </div>
        </PanelFoot>
      </Panel>
    </div>
  );
}

const DESCRIPTIONS: readonly (string | undefined)[] = [
  "The name on every screen and export, and where payroll is run.",
  "Optional, and it changes nothing you see.",
  "What every figure in Clarivo is labelled with.",
  "The month your financial year starts in.",
  "Optional. You can invite people any time from Settings.",
];

/**
 * A currency the select cannot offer is still the company's currency.
 *
 * `currency_code` is any three letters as far as the column is concerned and
 * `CURRENCY_OPTIONS` lists thirteen, so rendering the select without the
 * current value present would show an empty trigger and turn Continue into a
 * silent currency change — for an LBP company, say. Same guard as
 * `(main)/settings/page.tsx`.
 */
function currencyOptions(current: string): { value: string; label: string }[] {
  const options = CURRENCY_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
  return options.some((option) => option.value === current)
    ? options
    : [{ value: current, label: current }, ...options];
}

