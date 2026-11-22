"use client";

import { useId } from "react";
import { Notice, TextField } from "@/components/cv";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { INVITE_LEVELS, type InviteRole } from "@/lib/onboarding-options";

/**
 * Step 5 — invite your accountant.
 *
 * **Both access levels are described in full, side by side**, rather than one
 * sentence under whichever is selected. The choice is about who gets to see
 * every salary in the company, and a reader cannot make it from the label of
 * the option they have not clicked.
 *
 * **The Viewer sentence is the one to leave alone.** It says a viewer can see
 * employee-level pay on the Dashboard and Detailed View, because that is true:
 * `comparisons.getById` is a `memberProcedure` and hands every
 * `comparison_results` row — name, gross, net, per-component deltas — to any
 * signed-in member. Describing Viewer as having no access to salaries would be
 * a false promise printed on the screen that grants it. The wording lives in
 * `lib/onboarding-options.ts` so the server and this screen cannot drift.
 *
 * Native radios in a fieldset rather than `SegmentedControl`: the design
 * system's control shows labels only, and each option here needs its sentence.
 */
export function InviteStep({
  skip,
  onSkipChange,
  email,
  onEmailChange,
  role,
  onRoleChange,
  emailError,
  failure,
}: {
  skip: boolean;
  onSkipChange: (next: boolean) => void;
  email: string;
  onEmailChange: (next: string) => void;
  role: InviteRole;
  onRoleChange: (next: InviteRole) => void;
  emailError?: string;
  /** What Clerk said, when an invitation was attempted and did not go out. */
  failure?: string;
}) {
  const autoId = useId();
  const skipId = `invite-skip-${autoId}`;

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-[15px] leading-6 text-cv-ink-muted">
        Payroll is usually checked by somebody else. Invite them now and they get an email with
        a link to set up their own sign-in.
      </p>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id={skipId}
          checked={skip}
          onCheckedChange={(next) => onSkipChange(next === true)}
          className="mt-0.5"
        />
        <label htmlFor={skipId} className="text-sm leading-5 text-cv-ink">
          I&apos;ll do this later
          <span className="mt-0.5 block text-[13px] leading-[18px] text-cv-ink-subtle">
            You can invite people any time from Settings.
          </span>
        </label>
      </div>

      <div
        className={cn(
          "flex flex-col gap-5 transition-opacity",
          skip && "pointer-events-none opacity-50",
        )}
      >
        <TextField
          id={`invite-email-${autoId}`}
          label="Their email address"
          type="email"
          autoComplete="off"
          inputMode="email"
          value={email}
          disabled={skip}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="accountant@example.com"
          error={emailError}
          hint={emailError ? undefined : "The address they will sign in with."}
        />

        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink">
            Access level
          </legend>
          {INVITE_LEVELS.map((level) => {
            const id = `invite-role-${level.role}-${autoId}`;
            const selected = role === level.role;
            return (
              <div
                key={level.role}
                className={cn(
                  "flex items-start gap-2.5 rounded-cv-md border p-3 transition-colors",
                  selected ? "border-cv-accent bg-cv-accent-soft" : "border-cv-border bg-cv-surface",
                )}
              >
                <input
                  type="radio"
                  id={id}
                  name={`invite-role-${autoId}`}
                  value={level.role}
                  checked={selected}
                  disabled={skip}
                  onChange={() => onRoleChange(level.role)}
                  className="mt-1 h-4 w-4 flex-none accent-cv-accent focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
                />
                <label htmlFor={id} className="min-w-0 text-sm leading-5 text-cv-ink">
                  <span className="font-semibold">{level.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-[18px] text-cv-ink-muted">
                    {level.description}
                  </span>
                </label>
              </div>
            );
          })}
        </fieldset>
      </div>

      {failure && (
        <Notice tone="danger" title="The invitation was not sent">
          <p>{failure}</p>
          <p className="mt-1.5">
            Nobody has been invited and nothing has been saved. Press Finish to try again, or tick
            &quot;I&apos;ll do this later&quot; to finish without inviting anybody.
          </p>
        </Notice>
      )}
    </div>
  );
}
