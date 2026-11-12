"use client";

import { useId, useState } from "react";
import { Badge, Button, PageHeader, Panel, TextField } from "@/components/cv";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { COMPANY_EMPLOYEE_RANGES } from "@/lib/constants";

/**
 * Settings · Company — board "Settings: company", screen 8 of the Ink & Signal
 * rebuild.
 *
 * `PageHeader`, the shared tab row, then one `Panel` whose sections are split by
 * a `line` rule with the label column on the left, as the board draws it.
 *
 * **What this page does is unchanged, and it is worth stating plainly: it does
 * not save anything.** Every field is `useState` seeded with a literal — the
 * company is "Acme Corp", the tax id "12-3456789" — and `handleSave` waits a
 * second and flips a flag. `settings.updateCompany` exists in
 * `server/routers/settings.ts` and this page has never called it.
 *
 * So the fields are **not** wired to `settings.getCompany`, the query the top
 * bar runs for the company name, even though the top bar's comment says this
 * page runs it too. Wiring it here would put the real company name into a form
 * whose Save button discards it — an admin would rename the company, see
 * "Saved", and find the old name in the bar on the next page. Showing a fixture
 * next to a fake Save is the lesser of the two, so the fixture stays and the
 * rebuild is presentation only. Connecting the form to the router is a feature,
 * and it needs `editorProcedure` on the write when it lands: company-wide
 * settings are admin-and-manager, and `updateCompany` is a `protectedProcedure`
 * today, so any signed-in viewer could call it directly.
 */
export default function SettingsPage() {
  const [companyName, setCompanyName] = useState("Acme Corp");
  const [currency, setCurrency] = useState("USD");
  const [employeeRange, setEmployeeRange] = useState("51-200");
  const [taxId, setTaxId] = useState("12-3456789");
  const [address, setAddress] = useState("123 Main Street, New York, NY 10001");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const currencyId = useId();
  const rangeId = useId();

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Company"
        lede="Your company's details, and the currency and size every payroll file is read against."
      />

      <SettingsTabs />

      <Panel>
        <div className="flex flex-col gap-8">
          <Section
            title="Company profile"
            description="How your company is named on exports and invoices."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <TextField
                label="Tax ID / EIN"
                mono
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
              />
              <TextField
                className="sm:col-span-2"
                label="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </Section>

          <div className="h-px w-full bg-cv-line" />

          <Section
            title="Payroll defaults"
            description="The currency figures are shown in, and roughly how many people you pay."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Base currency" htmlFor={currencyId}>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id={currencyId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Employee range" htmlFor={rangeId}>
                <Select value={employeeRange} onValueChange={setEmployeeRange}>
                  <SelectTrigger id={rangeId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_EMPLOYEE_RANGES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-cv-line pt-5">
            {/* The old button read "Saved!" in place of its own label for three
                seconds. A control that renames itself is a control you cannot
                point at, so the confirmation sits beside it instead. */}
            {saved && (
              <Badge tone="success" icon="check">
                Saved
              </Badge>
            )}
            <Button onClick={() => void handleSave()} disabled={saving} loading={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** A labelled group of fields: the 280px label column on the left, as the board sets it. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
      <div className="min-w-0">
        <h3 className="m-0 text-base font-semibold leading-6 text-cv-ink">{title}</h3>
        <p className="m-0 mt-1 text-[13px] leading-[18px] text-cv-ink-subtle">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * A visible label over a control the design system has no field for (a Radix
 * select). `TextField` draws its own; this matches it, so a form row looks the
 * same whichever control it holds.
 */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
