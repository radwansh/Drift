import { PROBLEM } from "../content";

/**
 * Section 3: the problem, in the searcher's own words.
 *
 * The three figures are Geist Mono, as every figure on the page is. The EY
 * source line stays on the page and keeps its link: content.md is explicit
 * that the statistics describe US companies, so the attribution is part of the
 * claim rather than a footnote we can drop.
 */
export function Problem() {
  return (
    <section className="border-b border-cv-line bg-cv-bg">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <h2 className="max-w-[24ch] text-3xl font-semibold leading-tight tracking-[-0.02em] text-cv-ink sm:text-4xl">
          {PROBLEM.headline}
        </h2>

        <p className="mt-6 max-w-[70ch] text-lg leading-relaxed text-cv-ink-muted">{PROBLEM.body}</p>

        <dl className="mt-12 grid gap-6 sm:grid-cols-3">
          {PROBLEM.stats.map((s) => (
            <div key={s.value} className="flex flex-col gap-2 border-t border-cv-line pt-5">
              <dt className="order-2 text-sm leading-snug text-cv-ink-muted">{s.label}</dt>
              <dd className="order-1 font-cv-mono text-4xl font-medium leading-none tracking-[-0.02em] text-cv-ink">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-xs leading-relaxed text-cv-ink-subtle">
          <a
            href={PROBLEM.sourceHref}
            target="_blank"
            rel="noreferrer"
            className="rounded underline underline-offset-2 hover:text-cv-ink focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
          >
            {PROBLEM.source}
          </a>
        </p>

        <ul className="mt-12 grid gap-6 sm:grid-cols-3">
          {PROBLEM.pains.map((p) => (
            <li key={p.role} className="rounded-cv-lg border border-cv-line bg-cv-surface p-5">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-cv-ink-subtle">
                {p.role}
              </p>
              <p className="mt-2 text-base leading-snug text-cv-ink">{p.line}</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 max-w-[60ch] text-lg font-medium leading-relaxed text-cv-ink">
          {PROBLEM.transition}
        </p>
      </div>
    </section>
  );
}
