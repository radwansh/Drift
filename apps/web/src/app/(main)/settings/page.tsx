"use client";

import { useState } from "react";
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { trpc, type RouterOutputs } from "@/lib/trpc";

/**
 * The company profile, read from and written to `companies`, on Ink & Signal.
 *
 * It was five `useState` literals — `"Acme Corp"`, a tax id, a Manhattan
 * address — and a `handleSave` that waited a second and said "Saved!". So a
 * customer could not change their own company name, and the form told them
 * they had. The redesign restyled that version of the form, which is why its
 * copy of this file was discarded rather than merged: the markup its styling
 * belonged to is gone.
 *
 * **Two fields, because the table has two.** Tax ID, Address and Employee
 * Range are gone rather than wired, and were not folded into
 * `companies.settings` either:
 *
 * - `settings.updateCompany` now merges its `settings` patch instead of
 *   replacing the column, but it only accepts the keys on its own allow-list,
 *   and a profile field is not one of them. `plan`, the Stripe keys and
 *   `integrations` all live in that object and are each refused by name, so
 *   there is deliberately no route from this form to them.
 * - Nothing in the product reads a tax id, a registered address or a
 *   self-reported employee band: no screen, no export, no payroll rule. A
 *   stored value nothing reads is still a decoration — a persistent one — and
 *   the employee *count* that the pricing ladder bands by comes from
 *   `employee_snapshots`, not from a dropdown the customer picks.
 *
 * `COMPANY_EMPLOYEE_RANGES` in `lib/constants.ts` went with the dropdown; this
 * page was its only consumer.
 */
export default function SettingsPage() {
  const company = trpc.settings.getCompany.useQuery();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Company profile"
        lede="The name and currency every screen in Clarivo is labelled with."
      />

      {company.isPending && <CompanyProfileLoading />}

      {company.error && (
        <Notice tone="danger" title="Could not load your company">
          {company.error.message}
        </Notice>
      )}

      {company.data && (
        /**
         * Keyed on the company id, so the inputs are seeded once from the
         * first load and a background refetch cannot overwrite a half-typed
         * field — the rule `annual-budget.tsx` arrived at in finding C18. What
         * is stored stays visible through the `company` prop, which is what
         * the Save button and the "Saved" label compare against.
         */
        <CompanyProfileForm key={company.data.id} company={company.data} />
      )}
    </div>
  );
}

function CompanyProfileForm({ company }: { company: RouterOutputs["settings"]["getCompany"] }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(company.name);
  const [currency, setCurrency] = useState(company.currencyCode);

  const save = trpc.settings.updateCompany.useMutation({
    onSuccess: () => {
      void utils.settings.getCompany.invalidate();
    },
  });

  const trimmed = name.trim();
  // The router's own bounds, so the refusal is readable instead of a ZodError.
  const invalidName = trimmed.length === 0 || trimmed.length > 200;
  const unchanged = trimmed === company.name && currency === company.currencyCode;

  /**
   * A currency the select cannot offer is still the company's currency.
   *
   * `currencyCode` is any three letters as far as the column and the router are
   * concerned, and `CURRENCY_OPTIONS` lists thirteen. Rendering the select
   * without the stored value present would show an empty trigger and turn the
   * first save into a silent currency change for, say, an LBP company.
   */
  const options = CURRENCY_OPTIONS.some((opt) => opt.value === company.currencyCode)
    ? CURRENCY_OPTIONS
    : [
        { value: company.currencyCode, label: company.currencyCode },
        ...CURRENCY_OPTIONS,
      ];

  return (
    <Panel
      title="Company profile"
      description="Changing either of these is a company-wide change: both are admin or manager only."
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="company-name"
            label="Company name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={
              invalidName
                ? trimmed.length === 0
                  ? "A company name is required."
                  : "A company name is at most 200 characters."
                : undefined
            }
          />

          {/*
            The one control here the design system does not ship: a listbox is
            `components/ui/select`, re-skinned onto the same tokens. Its label
            is hand-built to match `TextField`'s, so the two sit level in the
            grid rather than one riding 2px high.
          */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="company-currency"
              className="text-[13px] font-medium leading-[18px] text-cv-ink"
            >
              Base currency
            </label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="company-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
              Labels every amount in the product. It does not convert anything: amounts are
              reported in the currency they were uploaded in.
            </p>
          </div>
        </div>

        {save.error && (
          <Notice tone="danger" title="That change did not save">
            {/* The procedure's own sentence names the annual feature, which is
                no longer the only thing behind this gate. */}
            {save.error.data?.code === "FORBIDDEN"
              ? "Changing the company profile requires the admin or manager role."
              : save.error.message}
          </Notice>
        )}
      </div>

      <PanelFoot>
        <div className="ml-auto flex items-center gap-3">
          {/**
            * Only for a write the database acknowledged, and only while what
            * is on screen still matches what was written — the old form said
            * "Saved!" after a `setTimeout` and went on saying it while the
            * fields were edited again.
            */}
          {/* TOKEN_MAP maps green text on "Saved" to a success badge with its
              icon: a status colour never carries a meaning on its own here. */}
          {save.isSuccess && unchanged && (
            <Badge tone="success" icon="check">
              Saved
            </Badge>
          )}
          <Button
            loading={save.isPending}
            disabled={save.isPending || invalidName || unchanged}
            onClick={() => save.mutate({ name: trimmed, currencyCode: currency })}
          >
            {save.isPending ? "Saving" : "Save changes"}
          </Button>
        </div>
      </PanelFoot>
    </Panel>
  );
}

/**
 * The design system's loading state is the scanning baseline — not two grey
 * rectangles shaped like the fields, which promise a particular form before
 * anyone knows the request succeeded.
 */
function CompanyProfileLoading() {
  return (
    <Panel title="Company profile">
      <div
        className="flex flex-col items-center justify-center gap-3 py-10"
        aria-busy="true"
      >
        <DriftStrip size="lg" count={24} animate="scan" label="Loading your company" />
        <p className="m-0 text-sm text-cv-ink-subtle">Loading your company</p>
      </div>
    </Panel>
  );
}
