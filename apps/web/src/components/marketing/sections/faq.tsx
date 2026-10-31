import { Icon } from "../ui";
import { FAQ, money, type Currency } from "../content";

/**
 * Section 10: the FAQ. Anchor #faq.
 *
 * Native <details>, all closed, two columns on desktop. Native rather than a
 * state-driven accordion so the section needs no JavaScript and stays a server
 * component, and so the browser's own find-in-page can open an answer
 * (`hidden="until-found"` behaviour) rather than missing text inside a closed
 * panel.
 *
 * The questions come from the same FAQ array that builds the FAQPage
 * structured data in the page's metadata, which is the point of keeping the
 * copy in one module.
 */
export function Faq({ currency }: { currency: Currency }) {
  return (
    <section id="faq" className="scroll-mt-20 border-b border-cv-line bg-cv-bg">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <h2 className="max-w-[28ch] text-3xl font-semibold leading-tight tracking-[-0.02em] text-cv-ink sm:text-4xl">
          {FAQ.headline}
        </h2>

        <div className="mt-10 grid gap-x-10 lg:grid-cols-2">
          {FAQ.items.map((item) => (
            <details
              key={item.q}
              className="group border-b border-cv-line [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-5 text-left text-base font-semibold text-cv-ink focus-visible:outline-none focus-visible:shadow-cv-focus-ring">
                <h3 className="min-w-0 text-base font-semibold">{item.q}</h3>
                <span className="mt-0.5 flex-none text-cv-ink-subtle transition-transform group-open:rotate-180">
                  <Icon name="chevron-down" size={18} />
                </span>
              </summary>
              <p className="pb-5 pr-8 text-base leading-relaxed text-cv-ink-muted">{money(item.a, currency)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
