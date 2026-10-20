import { Icon } from "../ui";
import { HOW_IT_WORKS } from "../content";

/**
 * Section 4: how it works, three numbered steps. Anchor #how-it-works.
 *
 * An ordered list, because the order is the content — these are steps, not
 * three features side by side. The connecting line is a decorative pseudo-rule
 * drawn only at the desktop width where the steps sit in a row; stacked on
 * mobile it would point nowhere, so it is hidden there.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b border-cv-line bg-cv-surface">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <p className="font-cv-mono text-[13px] font-medium uppercase tracking-wide text-cv-ink-subtle">
          {HOW_IT_WORKS.eyebrow}
        </p>
        <h2 className="mt-3 max-w-[32ch] text-3xl font-semibold leading-tight tracking-[-0.02em] text-cv-ink sm:text-4xl">
          {HOW_IT_WORKS.headline}
        </h2>

        <ol className="relative mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {/* The thin joining line, desktop only. */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-5 hidden h-px bg-cv-line sm:block"
          />

          {HOW_IT_WORKS.steps.map((step, i) => (
            <li key={step.title} className="relative flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="relative z-10 flex h-10 w-10 flex-none items-center justify-center rounded-cv-full border border-cv-line bg-cv-surface font-cv-mono text-sm font-medium text-cv-ink">
                  {i + 1}
                </span>
                <span className="text-cv-accent">
                  <Icon name={step.icon} size={20} />
                </span>
              </div>
              <h3 className="text-lg font-semibold leading-snug text-cv-ink">{step.title}</h3>
              <p className="text-base leading-relaxed text-cv-ink-muted">{step.line}</p>
            </li>
          ))}
        </ol>

        <p className="mt-12 text-base font-medium text-cv-ink-muted">{HOW_IT_WORKS.closing}</p>
      </div>
    </section>
  );
}
