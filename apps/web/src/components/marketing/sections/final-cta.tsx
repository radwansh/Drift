import { Button, DriftStrip } from "../ui";
import { FINAL_CTA } from "../content";
import { launch } from "@/config/launch";
import { authEntryPointsVisible } from "@/config/environment";
import { EarlyAccessButton } from "../early-access-button";

/**
 * Section 11: the final call to action.
 *
 * Ends on the same single action as the hero — "Get early access" is the only
 * sign-up label anywhere on the page, so a visitor meets one action
 * throughout, which content.md asks for explicitly.
 *
 * The baseline strip repeats with tick 74 drifted, per the README, closing the
 * page with the device it opened on.
 */
export function FinalCta() {
  return (
    <section className="border-b border-cv-line bg-cv-surface">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:px-6 lg:py-24">
        <DriftStrip count={120} drift={74} size="lg" className="max-w-full" />

        <h2 className="mt-10 text-balance text-3xl font-semibold leading-tight tracking-[-0.025em] text-cv-ink sm:text-4xl">
          {FINAL_CTA.headline}
        </h2>
        <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-cv-ink-muted">
          {FINAL_CTA.subHeadline}
        </p>

        {launch.founderLine && (
          <p className="mt-8 max-w-[62ch] text-sm leading-relaxed text-cv-ink-subtle">
            {FINAL_CTA.founderLine}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <EarlyAccessButton variant="accent" size="lg" iconRight="arrow-right">
            {FINAL_CTA.primary}
          </EarlyAccessButton>
          {/* Hidden on production until launch, like the header's. A server
              component, so the env read happens here directly. */}
          {authEntryPointsVisible && (
            <Button href="/sign-in" variant="secondary" size="lg">
              {FINAL_CTA.secondary}
            </Button>
          )}
        </div>

        <p className="mt-6 text-sm text-cv-ink-subtle">{FINAL_CTA.trust}</p>
      </div>
    </section>
  );
}
