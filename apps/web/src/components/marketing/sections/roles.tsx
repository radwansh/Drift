import { Icon } from "../ui";
import { ROLES } from "../content";

/**
 * Section 7: built for each role. Four cards, business owners first.
 *
 * The order is from content.md and is deliberate — the owner signs the
 * payroll, so they lead. Each card is written around what that person loses
 * today rather than what the product does.
 */
export function Roles() {
  return (
    <section className="border-b border-cv-line bg-cv-surface">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <p className="font-cv-mono text-[13px] font-medium uppercase tracking-wide text-cv-ink-subtle">
          {ROLES.eyebrow}
        </p>
        <h2 className="mt-3 max-w-[32ch] text-3xl font-semibold leading-tight tracking-[-0.02em] text-cv-ink sm:text-4xl">
          {ROLES.headline}
        </h2>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {ROLES.cards.map((card) => (
            <li
              key={card.role}
              className="flex flex-col gap-3 rounded-cv-lg border border-cv-line bg-cv-bg p-6"
            >
              <span className="text-cv-accent">
                <Icon name={card.icon} size={20} />
              </span>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-cv-ink-subtle">
                {card.role}
              </p>
              <h3 className="text-lg font-semibold leading-snug text-cv-ink">{card.headline}</h3>
              <p className="text-base leading-relaxed text-cv-ink-muted">{card.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
