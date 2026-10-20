"use client";

import { useId, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button, Icon } from "./ui";

/**
 * The early-access lead form: five fields, the submit, and the thank-you that
 * replaces them.
 *
 * Extracted so the dialog and /waitlist render the *same* form. They used to
 * be two: this one, and Clerk's `<Waitlist />`, which collects an email and
 * nothing else — a lead arriving that way reached Clerk but never the CRM,
 * which is the whole point of the form. One component, one submit path, one
 * record.
 *
 * `trial.submit` writes a trial_requests row, creates the Zoho lead and adds
 * the Clerk waitlist entry.
 */

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;
type CompanySize = (typeof COMPANY_SIZES)[number];

export interface EarlyAccessFormProps {
  /** The dialog points `aria-labelledby` at the heading this renders. */
  headingId?: string;
  /** 1 on a standalone page, where this is the main heading; 2 in the dialog. */
  headingLevel?: 1 | 2;
  /** A dismiss button on success. Omitted on a page, which has nothing to close. */
  onDone?: () => void;
}

export function EarlyAccessForm({ headingId, headingLevel = 2, onDone }: EarlyAccessFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companySize, setCompanySize] = useState<CompanySize | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const submit = trpc.trial.submit.useMutation();

  // A string tag so the surface decides the level; the landing page's h1 is the
  // hero, so the dialog must not claim another one.
  const Heading = headingLevel === 1 ? "h1" : "h2";

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "First name is required";
    if (!lastName.trim()) next.lastName = "Last name is required";
    if (!email.trim()) next.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email address";
    if (!companyName.trim()) next.companyName = "Company name is required";
    if (!companySize) next.companySize = "Select a company size";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    try {
      await submit.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        companyName: companyName.trim(),
        // Narrowed by validate(): companySize cannot be "" past this point.
        companySize: companySize as CompanySize,
      });
      setSubmitted(true);
    } catch (err) {
      setErrors({
        form: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    }
  }

  if (submitted) {
    return (
      // role="status" so the swap is announced rather than silently replacing
      // everything the reader had just been through.
      <div role="status" className="py-4 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cv-success-soft text-cv-success-ink">
          <Icon name="check" size={24} />
        </span>
        <Heading id={headingId} className="text-xl font-semibold text-cv-ink">
          Request received
        </Heading>
        <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-relaxed text-cv-ink-muted">
          You are on the list. We review every request by hand and will email you an access
          link when your place comes up.
        </p>
        {onDone && (
          <Button onClick={onDone} variant="accent" className="mt-6">
            Got it
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={cn("mb-6", onDone && "pr-10")}>
        <Heading id={headingId} className="text-xl font-semibold text-cv-ink">
          Get early access
        </Heading>
        <p className="mt-2 text-sm leading-relaxed text-cv-ink-muted">
          Clarivo is in closed beta. Tell us about your company and we will send an access
          link when a place opens.
        </p>
      </div>

      {errors.form && (
        <p
          role="alert"
          className="mb-4 rounded-cv-md bg-cv-danger-soft px-4 py-3 text-sm text-cv-danger-ink"
        >
          {errors.form}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName}>
            {(props) => (
              <input
                {...props}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            )}
          </Field>
          <Field label="Last name" error={errors.lastName}>
            {(props) => (
              <input
                {...props}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            )}
          </Field>
        </div>

        <Field label="Work email" error={errors.email}>
          {(props) => (
            <input
              {...props}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          )}
        </Field>

        <Field label="Company name" error={errors.companyName}>
          {(props) => (
            <input
              {...props}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoComplete="organization"
            />
          )}
        </Field>

        <Field label="Company size" error={errors.companySize}>
          {(props) => (
            <select
              {...props}
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value as CompanySize | "")}
            >
              <option value="">Select a size</option>
              {COMPANY_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} employees
                </option>
              ))}
            </select>
          )}
        </Field>

        <p className="text-xs leading-relaxed text-cv-ink-subtle">
          We use these details to review your request and nothing else. No newsletter, no
          sharing.
        </p>

        <Button
          type="submit"
          variant="accent"
          size="lg"
          loading={submit.isPending}
          disabled={submit.isPending}
        >
          {submit.isPending ? "Sending…" : "Request early access"}
        </Button>
      </form>
    </>
  );
}

/**
 * Label, control and error bound together by id, so a screen reader reads the
 * error as part of the field rather than as loose text after it. The control is
 * a render prop because it needs the generated ids.
 */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
    className: string;
  }) => React.ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-cv-ink">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
        className: cn(
          "h-10 w-full rounded-cv-md border bg-cv-surface px-3 text-sm text-cv-ink",
          "focus-visible:outline-none focus-visible:shadow-cv-focus-ring",
          error ? "border-cv-danger" : "border-cv-border",
        ),
      })}
      {error && (
        <p id={errorId} className="text-xs text-cv-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
