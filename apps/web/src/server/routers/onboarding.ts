import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { companies, payrollPeriods, users } from "@saas/db";
import { editorProcedure, memberProcedure, router } from "../trpc";
import {
  companySettingsObject,
  mergeCompanySettings,
  unsetCompanySettingsKeys,
} from "../company-settings";
import { scheduleTrialEndedEmail } from "../trial-email";
import { sendClerkInvitation } from "../clerk-invitations";
import { FiscalStartMonthSchema, writeFiscalStartMonth } from "./annual";
import { TRIAL_MS, TRIAL_SETTINGS_KEYS, trialEndOf } from "@/lib/entitlement";
import {
  COMPANY_NAME_MAX,
  COMPANY_NAME_MIN,
  INDUSTRIES,
  INVITE_LEVELS,
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEP_KEY,
  defaultCurrencyForCountry,
  defaultFiscalMonthForCountry,
  isCountryCode,
  onboardingStepOf,
} from "@/lib/onboarding-options";

/**
 * The five-step onboarding's writes.
 *
 * **Why this router exists at all.** Three of the values it collects are
 * refused by `settings.updateCompany` by name — `fiscalStartMonth` and the five
 * trial keys — and the trial keys are refused precisely so that no form can
 * reach them: `trialEndOf()` caps a trial at `trialStartedAt + TRIAL_DAYS` so a
 * stored date cannot stretch it, and letting a settings form write the date
 * would hand an admin the other half of that lock. CLAUDE.md names three
 * writers of the trial keys and this is the first of them. So onboarding does
 * not go through the settings endpoint; it writes its own keys, through the
 * expressions in `server/company-settings.ts`, in one statement each.
 *
 * **Every mutation is admin-only.** `editorProcedure` is admin *or manager*,
 * and setting up the company — its name, the currency every figure is labelled
 * with, the fiscal year the whole annual engine is cut by, and who gets invited
 * into it — is the owner's job rather than any editor's. The gate is
 * `editorProcedure` plus a role check rather than `adminProcedure` so that the
 * entitlement middleware and the company resolution are inherited unchanged.
 *
 * **No `onboardingCompletedAt` means no trial, and no lock-out.** A company
 * that existed before this release has none of the five keys, so
 * `entitlementOf()` answers `onboarding_incomplete` — which `server/trpc.ts`
 * deliberately does not refuse. Its admin is sent through these five steps
 * once, pre-filled with what the company already has, and its fourteen days
 * start when they press Finish.
 */

/** Admin only. `editorProcedure` would also admit a manager. */
const onboardingProcedure = editorProcedure.use(async ({ ctx, next }) => {
  if (ctx.currentUser.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Setting up the company requires the admin role.",
    });
  }
  return next({ ctx });
});

/**
 * Whether a `companies.settings` key holds something `lib/entitlement.ts` would
 * read as a date, as a SQL boolean.
 *
 * It mirrors `readDate()` there, which accepts a string or a number and returns
 * null for anything else — so the two sides agree on what "already set" means.
 * It cannot go further and check that the value *parses*: Postgres has no
 * try-cast outside a plpgsql block, and a `::timestamptz` cast on a stored
 * "nonsense" would abort the statement rather than answer false. The gap is
 * only reachable by a hand-written UPDATE, and it errs toward leaving a trial
 * alone, which is the safe direction for the thing this guard protects.
 *
 * `COALESCE(..., false)` at every call site, because a key that is absent makes
 * `jsonb_typeof` NULL, and `NULL IN (...)` is NULL rather than false — a
 * `NOT NULL IN (...)` in a WHERE clause would match no rows and the whole
 * statement would quietly do nothing.
 */
function holdsDate(key: string): SQL {
  return sql`COALESCE(jsonb_typeof(${companySettingsObject()} -> ${key}::text) IN ('string', 'number'), false)`;
}

/**
 * The progress marker for the step just finished, never going backwards.
 *
 * Read from the settings the auth middleware already loaded, so it costs no
 * round trip, and `GREATEST` in JS rather than in SQL because `(x ->> 'k')::int`
 * on a non-numeric stored value aborts the statement. Two admins saving two
 * different steps at the same moment can lose one increment of this number —
 * and nothing else, because the write itself is still a `jsonb ||` that cannot
 * touch another key. The cost of that race is a step re-shown once; it is not
 * the cost the one-statement rule exists to prevent.
 */
function stepPatch(settings: unknown, step: number): Record<string, number> {
  const reached = onboardingStepOf(settings as Record<string, unknown> | null | undefined);
  return { [ONBOARDING_STEP_KEY]: Math.max(reached, step) };
}

const CountryCodeSchema = z.string().refine(isCountryCode, {
  message: "That is not an ISO 3166-1 country code.",
});

/**
 * ISO 4217 is three upper-case letters, and `annual.ts` makes the same point:
 * "lbp" stored beside "LBP" is two currencies as far as every query is
 * concerned.
 */
const CurrencyCodeSchema = z
  .string()
  .length(3)
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z]{3}$/.test(s), { message: "Currency must be a 3-letter ISO code" });

const InviteRoleSchema = z.enum(
  INVITE_LEVELS.map((level) => level.role) as [string, ...string[]],
);

export const onboardingRouter = router({
  /**
   * What the flow renders: what is already stored, and where to resume.
   *
   * `memberProcedure`, not the admin gate above. `(main)/layout.tsx` redirects
   * **every** member of an un-onboarded company here, not only the admin, so a
   * viewer in a company that predates this release lands on this page too — and
   * has to be shown a sentence naming their company rather than a FORBIDDEN
   * error where the page should be. None of this is pay detail: it is the
   * company's own name, country and currency.
   *
   * **Two round trips**, on the pattern `getSummary` and the Employee File are
   * held to: the middleware's user lookup, then one `ctx.db.batch([...])` —
   * which `db.batch` on neon-http sends as a single HTTP request — for the
   * company row and the "has a period already" probe. The settings come free
   * with the middleware's join and are not read again.
   */
  getState: memberProcedure.query(async ({ ctx }) => {
    const [companyRows, periodRows] = await ctx.db.batch([
      ctx.db
        .select({ name: companies.name, currencyCode: companies.currencyCode })
        .from(companies)
        .where(eq(companies.id, ctx.companyId))
        .limit(1),
      /**
       * Whether any payroll figures are already labelled with the stored
       * currency, which is what makes step 3 read-only.
       *
       * `status = 'ready'` rather than any row at all: that is the filter every
       * annual and Employee File query uses, so a `ready` period is exactly one
       * whose figures a customer can see on a screen. A failed or still
       * processing upload has nothing rendered against it, and treating one as
       * a lock would leave a company whose first upload failed unable to ever
       * set its currency.
       */
      ctx.db
        .select({ id: payrollPeriods.id })
        .from(payrollPeriods)
        .where(and(eq(payrollPeriods.companyId, ctx.companyId), eq(payrollPeriods.status, "ready")))
        .limit(1),
    ]);

    const company = companyRows[0];
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });

    const settings = (ctx.companySettings ?? {}) as Record<string, unknown>;
    const country = isCountryCode(settings.country) ? settings.country : null;
    const industry =
      typeof settings.industry === "string" && settings.industry.length > 0
        ? settings.industry
        : null;
    const storedMonth = settings.fiscalStartMonth;

    return {
      /** Only an admin can save anything; the page says so rather than failing. */
      isAdmin: ctx.currentUser.role === "admin",
      name: company.name,
      currencyCode: company.currencyCode,
      country,
      industry,
      /**
       * Null when nobody has set it, so the step can offer the country's
       * default instead of showing January as though it had been chosen.
       */
      fiscalStartMonth: typeof storedMonth === "number" ? storedMonth : null,
      /** How far they got: 0 means nothing saved, 5 means every step saved. */
      stepsSaved: onboardingStepOf(settings),
      currencyLocked: periodRows.length > 0,
      /** The admin's own address, so step 5 can refuse an invitation to it. */
      ownEmail: ctx.currentUser.email,
    };
  }),

  /**
   * Step 1 — the company's name and country, in one statement.
   *
   * The name replaces the placeholder `ensureUser` writes (`"<name>'s company"`
   * or `"My company"`), which is why its lower bound is 2 rather than 1: a
   * one-character company name is a mis-key, and the placeholder it replaces is
   * never what the customer would have chosen.
   *
   * `country` is the key the rest of the flow derives from — the currency
   * pre-selection and the fiscal month both come from it — and it is also the
   * marker that step 1 was done. That inference is sound because this statement
   * writes the name and the country together: there is no state where the
   * country is set and the name is still a placeholder.
   */
  saveCompanyBasics: onboardingProcedure
    .input(
      z.object({
        name: z.string().trim().min(COMPANY_NAME_MIN).max(COMPANY_NAME_MAX),
        country: CountryCodeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(companies)
        .set({
          name: input.name,
          settings: mergeCompanySettings({
            country: input.country,
            ...stepPatch(ctx.companySettings, 1),
          }),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, ctx.companyId));

      return {
        name: input.name,
        country: input.country,
        /** What steps 3 and 4 will offer, so the client need not re-derive it. */
        suggestedCurrency: defaultCurrencyForCountry(input.country),
        suggestedFiscalStartMonth: defaultFiscalMonthForCountry(input.country),
      };
    }),

  /**
   * Step 2 — the industry, which is optional.
   *
   * **It promises nothing.** Clarivo has no benchmarks and no industry
   * insights: nothing in the product reads this key today. It is stored because
   * it is cheap and asked once, not because a screen is waiting for it, and the
   * step's copy says "Optional." and no more than that.
   *
   * `null` clears it, through the `- 'key'::text` delete in
   * `server/company-settings.ts` rather than by storing a JSON null — the same
   * distinction `settings.updateCompany` draws with `unsetSettings`, for the
   * same reason: a stored null is a value, and "no industry" is the absence of
   * one.
   */
  saveIndustry: onboardingProcedure
    .input(z.object({ industry: z.enum(INDUSTRIES).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const progress = stepPatch(ctx.companySettings, 2);
      const settings =
        input.industry === null
          ? unsetCompanySettingsKeys(mergeCompanySettings(progress), ["industry"])
          : mergeCompanySettings({ industry: input.industry, ...progress });

      await ctx.db
        .update(companies)
        .set({ settings, updatedAt: new Date() })
        .where(eq(companies.id, ctx.companyId));

      return { industry: input.industry };
    }),

  /**
   * Step 3 — the base currency, on `companies.currency_code`.
   *
   * **Refused once the company has a `ready` payroll period**, and refused here
   * rather than only hidden by the step: `currency_code` labels every figure in
   * the product and converts nothing, so changing it after figures exist
   * relabels a year of payroll as a currency it was never paid in. Submitting
   * the value that is already stored is allowed, because that is not a change —
   * it is the Continue button on a read-only step.
   */
  saveCurrency: onboardingProcedure
    .input(z.object({ currencyCode: CurrencyCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ currencyCode: companies.currencyCode })
        .from(companies)
        .where(eq(companies.id, ctx.companyId))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });

      if (existing.currencyCode !== input.currencyCode) {
        const [period] = await ctx.db
          .select({ id: payrollPeriods.id })
          .from(payrollPeriods)
          .where(
            and(eq(payrollPeriods.companyId, ctx.companyId), eq(payrollPeriods.status, "ready")),
          )
          .limit(1);
        if (period) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `This company already has payroll in ${existing.currencyCode}. Clarivo converts nothing, so changing the base currency now would relabel figures that were never paid in it.`,
          });
        }
      }

      await ctx.db
        .update(companies)
        .set({
          currencyCode: input.currencyCode,
          settings: mergeCompanySettings(stepPatch(ctx.companySettings, 3)),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, ctx.companyId));

      return { currencyCode: input.currencyCode };
    }),

  /**
   * Step 4 — the fiscal year's start month.
   *
   * **Through `writeFiscalStartMonth`, which is also what
   * `annual.setFiscalStartMonth` calls.** `routers/settings.ts` refuses
   * `fiscalStartMonth` by name and points at that endpoint, and the reason is
   * not only the 1..12 bound: the writer also clears the annual summary memo,
   * which is keyed on inputs rather than on settings, so a month written
   * without it leaves the dashboard drawing last month's year boundaries for up
   * to thirty seconds. Sharing the function is what makes that impossible to
   * forget here.
   *
   * **A month, never a day.** `packages/payroll-core/src/annual/fiscal.ts`
   * models a start month and the engine has no notion of a start day, so a day
   * collected here would be a number nothing can read.
   *
   * Two statements, deliberately: the shared writer owns the month, and the
   * progress marker is a second `jsonb ||`. Both merge into the column under
   * its own row lock, so neither can lose a concurrent write to another key —
   * which is what the one-statement rule protects against. What it forbids is a
   * read-modify-write, and neither of these is one.
   */
  saveFiscalStartMonth: onboardingProcedure
    .input(z.object({ month: FiscalStartMonthSchema }))
    .mutation(async ({ ctx, input }) => {
      await writeFiscalStartMonth(ctx.db, ctx.companyId, input.month);
      await ctx.db
        .update(companies)
        .set({
          settings: mergeCompanySettings(stepPatch(ctx.companySettings, 4)),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, ctx.companyId));
      return { month: input.month };
    }),

  /**
   * Step 5 — invite the accountant, for real.
   *
   * **Both halves, in this order.** The row in `users` is what
   * `ensureUser` claims by email when the person signs in, so it is what makes
   * them land in *this* company with the role chosen here rather than in a
   * company of their own. The Clerk invitation is what actually tells them.
   * `auth.inviteUser` has only ever done the first half.
   *
   * Clerk goes first and the row second, because a Clerk invitation is
   * retryable — `sendClerkInvitation` passes `ignoreExisting` — while a `users`
   * row left behind by a failed invitation is a person in the user list who was
   * never told. The likeliest reason the insert fails is `users.email` being
   * UNIQUE **across the whole table**, so that is checked before anything is
   * sent, and the refusal says which case it is.
   */
  inviteAccountant: onboardingProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email(),
        role: InviteRoleSchema,
        /** Shown in the user list until they sign in and Clerk supplies theirs. */
        name: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.email === ctx.currentUser.email.trim().toLowerCase()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That is your own address. Invite your accountant's address instead.",
        });
      }

      const [clash] = await ctx.db
        .select({ companyId: users.companyId })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            clash.companyId === ctx.companyId
              ? "That address is already on your company."
              : "That address already has a Clarivo account.",
        });
      }

      const sent = await sendClerkInvitation(input.email);
      if (!sent.ok) {
        // Nothing has been written, and the message says so: an admin must
        // never be shown a sent invitation that was not sent.
        throw new TRPCError({ code: "BAD_GATEWAY", message: sent.message });
      }

      const [invited] = await ctx.db
        .insert(users)
        .values({
          companyId: ctx.companyId,
          email: input.email,
          name: input.name && input.name.length > 0 ? input.name : input.email,
          role: input.role,
          // Null until they sign in: `ensureUser` matches on a null (or legacy
          // empty) clerk id and claims the row. Finding 4c — `""` collided on
          // the UNIQUE index, so only the first invitation in a company ever
          // succeeded.
          clerkUserId: null,
        })
        .returning({ id: users.id });

      if (!invited) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The invitation was sent, but the access level could not be recorded. Try again: a repeated invitation to the same address is accepted.",
        });
      }

      await ctx.db
        .update(companies)
        .set({
          settings: mergeCompanySettings(stepPatch(ctx.companySettings, 5)),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, ctx.companyId));

      return { email: input.email, role: input.role, invitationId: sent.invitationId };
    }),

  /**
   * Finish — the only writer that starts a trial.
   *
   * **One statement, and only if the trial is not already set.** Finishing
   * twice must change nothing and must never restart or lengthen the fourteen
   * days, and that is a real path rather than a hypothetical one: a
   * double-submit, a retried request, a bookmarked finish URL. Two things make
   * it true, and they answer different questions:
   *
   * - **The `WHERE` clause** requires `onboardingCompletedAt` to be unset, so a
   *   second call matches no row, writes nothing at all — `updated_at`
   *   included — and returns nothing. It is the guard rather than a
   *   read-then-check in application code because two concurrent calls would
   *   both pass a check; only one can match the row.
   * - **The per-key `CASE`s** on `trialStartedAt` and `trialEndsAt` keep an
   *   existing start date even in a state no path through the app produces —
   *   one of the three keys set and not the others. Preserving the *start*
   *   there is what stops a trial being restarted, and `trialEndOf()` caps the
   *   end at start + 14 days anyway, so no combination of stored values can buy
   *   more than fourteen days.
   *
   * `trialStartedAt` and `trialEndsAt` are server time plus `TRIAL_MS` — exact
   * hours from `lib/entitlement.ts`, not fourteen calendar days, because that
   * is the arithmetic `trialEndOf()`'s cap uses and a different one here would
   * make the cap bite on every company.
   *
   * Then the trial-ended email is scheduled. **A null id is a normal answer**:
   * `server/trial-email.ts` is a placeholder that returns null, and it must
   * never fail onboarding — a customer who cannot finish signing up because an
   * email could not be scheduled is a worse failure than a missing email.
   */
  finish: onboardingProcedure.mutation(async ({ ctx }) => {
    const settings = (ctx.companySettings ?? {}) as Record<string, unknown>;
    if (!isCountryCode(settings.country)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Company basics have not been saved yet.",
      });
    }

    const startedAt = new Date();
    const startedIso = startedAt.toISOString();
    const endsIso = new Date(startedAt.getTime() + TRIAL_MS).toISOString();

    const trialPatch = sql`jsonb_strip_nulls(jsonb_build_object(
      ${TRIAL_SETTINGS_KEYS.onboardingCompletedAt}::text, ${startedIso}::text,
      ${TRIAL_SETTINGS_KEYS.trialStartedAt}::text,
        CASE WHEN ${holdsDate(TRIAL_SETTINGS_KEYS.trialStartedAt)} THEN NULL ELSE ${startedIso}::text END,
      ${TRIAL_SETTINGS_KEYS.trialEndsAt}::text,
        CASE WHEN ${holdsDate(TRIAL_SETTINGS_KEYS.trialEndsAt)} THEN NULL ELSE ${endsIso}::text END,
      ${ONBOARDING_STEP_KEY}::text, ${ONBOARDING_STEP_COUNT}::int
    ))`;

    const [completed] = await ctx.db
      .update(companies)
      .set({ settings: mergeCompanySettings(trialPatch), updatedAt: new Date() })
      .where(
        and(
          eq(companies.id, ctx.companyId),
          sql`NOT ${holdsDate(TRIAL_SETTINGS_KEYS.onboardingCompletedAt)}`,
        ),
      )
      .returning({ settings: companies.settings });

    if (!completed) {
      // Already finished. Nothing was written and nothing is scheduled: the
      // first finish did both, and the daily `/api/cron/trial-ended` backup is
      // what covers a scheduling failure on that first pass.
      return { alreadyComplete: true, trialEndsAt: trialEndOf(settings) };
    }

    const stored = completed.settings as Record<string, unknown>;
    // Through the contract's own capped reader rather than the local
    // `endsIso`, so the date handed to the email is the date the paywall will
    // enforce — including in the partial state the CASEs above preserve.
    const trialEndsAt = trialEndOf(stored);

    if (trialEndsAt !== null) {
      const emailId = await scheduleTrialEndedEmail({
        db: ctx.db,
        companyId: ctx.companyId,
        trialEndsAt,
      });
      if (emailId !== null) {
        /**
         * A second statement, because the id does not exist until the email is
         * scheduled and the email cannot be scheduled before the dates are
         * written. It is still a `jsonb ||` merge, so it cannot lose a
         * concurrent write to another key; and it is skipped entirely when
         * scheduling returned null, which is every environment today.
         */
        await ctx.db
          .update(companies)
          .set({
            settings: mergeCompanySettings({
              [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: emailId,
            }),
            updatedAt: new Date(),
          })
          .where(eq(companies.id, ctx.companyId));
      }
    }

    return { alreadyComplete: false, trialEndsAt };
  }),
});
