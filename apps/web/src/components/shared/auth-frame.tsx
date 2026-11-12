import { Logo } from "@/components/cv";

/**
 * The frame around Clerk's sign-in and sign-up screens (redesign canvas: "Sign in
 * (Clerk, themed)"): an Ink panel with the reversed lockup and one calm line on the
 * left, the form on paper on the right. Below 900px the Ink panel is hidden and the
 * lockup sits above the form.
 *
 * Copy follows the voice: plain, precise, no exclamation marks.
 */
export function AuthFrame({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-cv-bg font-cv-sans text-cv-ink min-[900px]:grid-cols-2">
      <div
        data-cv-theme="dark"
        className="hidden flex-col justify-between gap-8 bg-cv-surface p-10 text-cv-ink min-[900px]:flex dark:bg-cv-surface-sunken"
      >
        <Logo variant="lockup" tone="reversed" height={28} title="Clarivo" />
        <div className="max-w-[44ch]">
          <p className="m-0 text-[28px] font-semibold leading-[34px] tracking-[-0.02em]">{title}</p>
          <p className="m-0 mt-3 text-[15px] leading-6 text-cv-ink-muted">{lede}</p>
        </div>
        <p className="m-0 text-xs leading-4 text-cv-ink-subtle">
          Payroll variance analysis for companies of 200 to 2,000 employees.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center gap-8 px-4 py-10">
        <div className="min-[900px]:hidden">
          <Logo variant="lockup" height={32} title="Clarivo" />
        </div>
        {children}
      </div>
    </div>
  );
}
