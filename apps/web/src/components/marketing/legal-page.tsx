import { Button } from "./ui";
import { SITE } from "./content";

/**
 * Shell for /privacy, /terms, /security and /dpa.
 *
 * None of these documents exists yet. The hand-off README and the Step 3
 * prompt both say never to invent legal text, and there was nothing in the
 * repo to rename, so the routes exist with the real layout and an honest
 * notice instead of drafted clauses.
 *
 * The routes are created now rather than later because the footer, the
 * security section and the sitemap all link to them: a 404 behind a "Privacy
 * policy" link in the footer is worse than a page that says the text is being
 * prepared.
 */
export function LegalPagePlaceholder({
  title,
  intro,
}: {
  title: string;
  intro: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
      <h1 className="text-3xl font-semibold leading-tight tracking-[-0.025em] text-cv-ink sm:text-4xl">
        {title}
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-cv-ink-muted">{intro}</p>

      <div className="mt-8 rounded-cv-lg border border-cv-line bg-cv-surface p-6">
        <p className="text-base leading-relaxed text-cv-ink">
          This document is being prepared and will be published before Clarivo leaves beta. If you
          need it now — for a procurement review, a DPA or a security questionnaire — write to us
          and we will send you the current position in writing.
        </p>
        <Button href={`mailto:${SITE.email}`} variant="secondary" className="mt-5">
          Email {SITE.email}
        </Button>
      </div>
    </div>
  );
}
