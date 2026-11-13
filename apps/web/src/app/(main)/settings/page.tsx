"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { Save, Building2, TriangleAlert, Loader2 } from "lucide-react";

/**
 * The company profile, read from and written to `companies`.
 *
 * It was five `useState` literals — `"Acme Corp"`, a tax id, a Manhattan
 * address — and a `handleSave` that waited a second and said "Saved!". So a
 * customer could not change their own company name, and the form told them
 * they had.
 *
 * **Two fields, because the table has two.** Tax ID, Address and Employee
 * Range are gone rather than wired, and were not folded into
 * `companies.settings` either:
 *
 * - `settings.updateCompany`'s `settings` input **replaces** the whole JSON
 *   object, and that object is where `plan`, the Stripe subscription keys and
 *   `integrations` live. Persisting three profile fields through it would need
 *   the write to become a read-modify-write first; getting that wrong wipes a
 *   company's billing and integration state, which is a worse failure than not
 *   having a tax-id field.
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
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-muted-foreground mt-1">Manage your company profile and preferences</p>
      </div>

      {company.isPending && <CompanyProfileSkeleton />}

      {company.error && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{company.error.message}</AlertDescription>
        </Alert>
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Company Profile</CardTitle>
        </div>
        <CardDescription>Update your organization&apos;s details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="company-name" className="text-sm font-medium">
              Company Name
            </label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={invalidName}
            />
            {invalidName && (
              <p className="text-xs text-destructive">
                {trimmed.length === 0
                  ? "A company name is required."
                  : "A company name is at most 200 characters."}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor="company-currency" className="text-sm font-medium">
              Base Currency
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
            <p className="text-xs text-muted-foreground">
              Labels every amount in the product. It does not convert anything: amounts are
              reported in the currency they were uploaded in.
            </p>
          </div>
        </div>

        {save.error && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              {/* The procedure's own sentence names the annual feature, which is
                  no longer the only thing behind this gate. */}
              {save.error.data?.code === "FORBIDDEN"
                ? "Changing the company profile requires the admin or manager role."
                : save.error.message}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <div className="ml-auto flex items-center gap-3">
          {/**
            * Only for a write the database acknowledged, and only while what
            * is on screen still matches what was written — the old form said
            * "Saved!" after a `setTimeout` and went on saying it while the
            * fields were edited again.
            */}
          {save.isSuccess && unchanged && (
            <span className="text-sm text-muted-foreground">Saved</span>
          )}
          <Button
            onClick={() => save.mutate({ name: trimmed, currencyCode: currency })}
            disabled={save.isPending || invalidName || unchanged}
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {save.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function CompanyProfileSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Company Profile</CardTitle>
        </div>
        <CardDescription>Update your organization&apos;s details</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </CardContent>
    </Card>
  );
}
