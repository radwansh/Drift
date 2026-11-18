import { market, type Currency } from "../content";

/**
 * A section only one market gets, from `MARKETS[currency].note`.
 *
 * It exists for `/au`. Australia's payroll year is not the euro page's with a
 * different symbol in front of it: superannuation goes out with every pay run
 * since 1 July 2026, the register is exported fortnightly from Xero, MYOB or
 * Employment Hero, and none of that has a place in the shared sections. A page
 * that said none of it would be `/us` with A$ on it, which is worth nothing to
 * an Australian reader.
 *
 * `limit` is a field of its own rather than the last sentence of `body`
 * because of what it carries: Clarivo does not check Payday Super compliance
 * and cannot know whether money reached a fund. The structure makes that
 * sentence impossible to drop while keeping the paragraph that sets it up.
 *
 * Markets with no note render nothing, so `/` and `/us` are unchanged.
 */
export function MarketNote({ currency }: { currency: Currency }) {
  const note = market(currency).note;
  if (!note) return null;

  return (
    <section className="border-b border-cv-line bg-cv-bg">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <p className="font-cv-mono text-[13px] font-medium uppercase tracking-wide text-cv-ink-subtle">
          {note.eyebrow}
        </p>
        <h2 className="mt-3 max-w-[30ch] text-3xl font-semibold leading-tight tracking-[-0.02em] text-cv-ink sm:text-4xl">
          {note.headline}
        </h2>

        <p className="mt-5 max-w-[70ch] text-lg leading-relaxed text-cv-ink-muted">{note.body}</p>
        <p className="mt-5 max-w-[70ch] text-base leading-relaxed text-cv-ink">{note.limit}</p>

        <ul className="mt-10 grid gap-5 sm:grid-cols-3">
          {note.points.map((point) => (
            <li
              key={point.title}
              className="flex flex-col gap-2 rounded-cv-lg border border-cv-line bg-cv-surface p-5"
            >
              <h3 className="text-base font-semibold leading-snug text-cv-ink">{point.title}</h3>
              <p className="text-sm leading-relaxed text-cv-ink-muted">{point.line}</p>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-xs leading-relaxed text-cv-ink-subtle">
          <a
            href={note.sourceHref}
            target="_blank"
            rel="noreferrer"
            className="rounded underline underline-offset-2 hover:text-cv-ink focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
          >
            {note.source}
          </a>
        </p>
      </div>
    </section>
  );
}
