import { describe, it, expect } from "vitest";
import * as content from "@/components/marketing/content";
import {
  FAQ,
  FINAL_CTA,
  HERO,
  MARKETS,
  MARKET_CURRENCIES,
  PRICING,
  TRIAL,
  TRIAL_CTA,
  TRUST_LINE,
  highestMonthlyListPrice,
  market,
  marketFaq,
  money,
  planPrices,
} from "@/components/marketing/content";
import { structuredData } from "@/components/marketing/landing";
import { GET as llmsTxt } from "@/app/llms.txt/route";
import { TRIAL_DAYS } from "@/lib/entitlement";

/**
 * What a market page is allowed to say, and what it must not.
 *
 * `/au` exists because a currency swap is not a market page: Australia charges
 * GST rather than VAT, pays fortnightly rather than "bi-weekly", exports its
 * register from Xero or MYOB, and the payroll-error statistics on `/` come
 * from a survey of US companies. None of that is visible to typecheck, and the
 * rendered page is the only other place it would show — so it is pinned here.
 *
 * The other half of the job is making sure the Australian page did not drag
 * `/` and `/us` along with it. Those two read one shared object, and the
 * assertions below say so.
 */
/** Every Australian line, as one blob, for the vocabulary assertions. */
const australianCopy = (): string => {
  const au = market("AUD");
  const note = au.note;
  return [
    au.taxLine,
    au.uploadStep ?? "",
    au.cadenceIncludes ?? "",
    au.securityNote ?? "",
    ...Object.values(au.faq.replace),
    ...au.faq.extra.map((item) => `${item.q} ${item.a}`),
    note ? `${note.headline} ${note.body} ${note.limit}` : "",
    ...(note?.points ?? []).map((point) => `${point.title} ${point.line}`),
  ].join(" ");
};

describe("the Australian market page", () => {
  /**
   * `A$` is the Australian dollar sign, so it goes on every Australian amount
   * the page states — prices and sample figures alike, through the one
   * `money()`. This briefly split into `money()` for prices and a
   * `sampleAmount()` writing a bare `$` for the demo dashboard; that was wrong
   * about the sign and is reverted.
   */
  it("renders Australian dollars as A$, never a bare $", () => {
    expect(money("¤49", "AUD")).toBe("A$49");
    expect(money("¤79", "AUD")).toBe("A$79");
    expect(money("+¤18,420", "AUD")).toBe("+A$18,420");
    expect(money("−¤860", "AUD")).toBe("−A$860");
    // `/us` uses `$`, so the two have to be told apart at a glance.
    expect(money("¤49", "USD")).toBe("$49");
  });

  it("prices Australia at A$49 and A$79", () => {
    const au = Object.fromEntries(
      PRICING.plans.map((plan) => [plan.name, planPrices(plan, "AUD")]),
    );

    expect(money(au.Starter?.listMonthly ?? "", "AUD")).toBe("A$49");
    expect(money(au.Starter?.listYearly ?? "", "AUD")).toBe("A$490");
    expect(money(au.Growth?.listMonthly ?? "", "AUD")).toBe("A$79");
    expect(money(au.Growth?.listYearly ?? "", "AUD")).toBe("A$790");
  });

  /**
   * The ladder's shape, in every market at once: a year costs ten months.
   *
   * It used to assert a second rule — that the founder price was at most half
   * the list price, which is what the "−50% for 24 months" badge promised. The
   * beta discount is gone from every market, so there is one ladder to check.
   */
  it.each(MARKET_CURRENCIES)("builds the %s ladder the same way", (currency) => {
    for (const plan of PRICING.plans) {
      const figures = planPrices(plan, currency);
      const value = (figure: string) => Number(figure.replace("¤", "").replace(/,/g, ""));

      expect(value(figures.listYearly)).toBe(value(figures.listMonthly) * 10);
    }
  });

  /**
   * The discount is gone, and nothing may quietly put it back.
   *
   * A price the page quotes and the checkout does not charge is the specific
   * failure this removal was for: the site promised €14 while Polar billed €29.
   */
  it("publishes no beta founder discount in any market", () => {
    for (const currency of MARKET_CURRENCIES) {
      for (const plan of PRICING.plans) {
        // Not an exact key list: `planPrices` falls back to the plan object
        // itself for `/` and `/us`, so EUR and USD carry `name`, `for` and
        // `highlighted` alongside the two figures. What must be absent is the
        // second ladder.
        const figures = planPrices(plan, currency);
        expect(figures).not.toHaveProperty("founderMonthly");
        expect(figures).not.toHaveProperty("founderYearly");
        expect(figures.listMonthly).toMatch(/^¤[\d,]+$/);
        expect(figures.listYearly).toMatch(/^¤[\d,]+$/);
      }
    }
    expect(PRICING).not.toHaveProperty("founderBadge");
    expect(`${PRICING.headline} ${PRICING.subHeadline} ${PRICING.smallPrint}`).not.toMatch(
      /founder|−50%|50% off/i,
    );
    expect(australianCopy()).not.toMatch(/founder price|beta founders|−50%/i);
  });

  it("names GST, and leaves VAT off the page entirely", () => {
    expect(market("AUD").taxLine).toBe("Prices exclude GST.");
    expect(australianCopy()).not.toContain("VAT");
    // The shared small print names no tax at all, so a new market cannot
    // inherit the wrong one by forgetting to override it.
    expect(PRICING.smallPrint).not.toMatch(/VAT|GST/);
    expect(market("EUR").taxLine).toBe("Prices exclude VAT.");
  });

  it("says fortnightly, and says what the app calls it", () => {
    const copy = australianCopy();
    expect(copy).toContain("fortnightly");
    // The app's cadence vocabulary is untouched — this page translates it for
    // the reader rather than renaming it for every customer.
    expect(copy).toContain("Bi-weekly");
    expect(copy).not.toContain("bi-weekly");
  });

  it("names Xero, MYOB and Employment Hero as exports, and claims no connection", () => {
    const copy = australianCopy();
    expect(copy).toContain("Xero");
    expect(copy).toContain("MYOB");
    expect(copy).toContain("Employment Hero");
    expect(copy).toContain("connects to none of them");
  });

  /**
   * The statistics. The EY survey polled US companies, so it cannot appear
   * here under an Australian heading, and an Australian figure has to carry an
   * Australian source.
   *
   * The money figures carry `A$`, as every Australian amount on the page does.
   * A bare `$` on a regulator's figure would read as US dollars, which is a
   * different and wrong number.
   */
  it("cites an Australian regulator for its Australian figures", () => {
    const problem = market("AUD").problem;

    expect(problem).not.toBeNull();
    expect(problem?.sourceHref).toContain("fairwork.gov.au");
    expect(problem?.source).toContain("Fair Work Ombudsman");
    expect(problem?.source).not.toContain("EY");
    for (const stat of problem?.stats ?? []) {
      expect(stat.value.startsWith("$")).toBe(false);
    }
    // And the euro and dollar pages do not inherit an Australian regulator's
    // figures, which is what lets these be stored as literals.
    for (const currency of ["EUR", "USD"] as const) {
      expect(market(currency).problem).toBeNull();
    }
  });

  /**
   * Payday Super is in force and Clarivo does not check it. The sentence that
   * says so is pinned, because the page would otherwise be one enthusiastic
   * edit away from claiming a compliance check that does not exist and cannot
   * exist from a payroll file.
   */
  it("promises no Payday Super compliance check", () => {
    expect(australianCopy()).toContain("does not check Payday Super compliance");
  });

  it("asks the superannuation question on the page and in the markup", () => {
    const ids = marketFaq("AUD").map((item) => item.id);
    expect(ids).toContain("superannuation");
    expect(marketFaq("EUR").map((item) => item.id)).not.toContain("superannuation");

    const markup = JSON.stringify(structuredData("AUD", "/au"));
    expect(markup).toContain("Does Clarivo check superannuation or Payday Super?");
  });

  it("quotes Australian prices in the structured data", () => {
    const au = JSON.stringify(structuredData("AUD", "/au"));
    expect(au).toContain('"priceCurrency":"AUD"');
    expect(au).toContain('"highPrice":"79"');
    expect(au).toContain("A$49");

    // The euro page keeps its own range, from the same pricing table.
    expect(highestMonthlyListPrice("EUR")).toBe("49");
    expect(highestMonthlyListPrice("AUD")).toBe("79");
  });
});

/**
 * The trial, and the one number behind it.
 *
 * `TRIAL_DAYS` in `lib/entitlement.ts` decides how long a company may use
 * Clarivo without paying. The page decides what a visitor was promised. When
 * those two disagree the product is either taking the app away early or giving
 * it away late, and the person who finds out is the customer — so the only
 * defence is that no copy anywhere states a length of its own.
 *
 * The specific failure these assertions exist for already happened in this
 * repo, in the shape of a price: the pricing section promised €14 while the
 * Polar checkout charged €29, because two ladders were stored instead of one.
 * A trial length is the same hazard with a worse ending, and the 30-day
 * `sendTrialApprovedEmail` still sitting in `lib/resend.ts` from the Zoho flow
 * is the proof that a second copy survives long after the flow around it dies.
 */
describe("the trial, on every public surface", () => {
  /** Every string a visitor can read, from the one module that holds them. */
  const everyCopyString = (): string[] => {
    const found: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === "string") {
        found.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value !== null && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(content);
    return found;
  };

  it("says what the brief says, word for word", () => {
    expect(TRIAL).toBe("14-day free trial");
    expect(TRIAL_CTA).toBe("Start 14-day free trial");
    expect(TRUST_LINE).toBe("14-day free trial · No credit card · Cancel anytime");
  });

  it("builds all three from TRIAL_DAYS, not from a literal", () => {
    // The point of the constant: change `TRIAL_DAYS` and the copy moves with
    // it. A literal "14-day" in content.ts would pass the assertions above and
    // fail this one.
    expect(TRIAL).toContain(String(TRIAL_DAYS));
    expect(TRIAL_CTA).toContain(String(TRIAL_DAYS));
    expect(TRUST_LINE).toContain(String(TRIAL_DAYS));
  });

  it("uses one trust line and one sign-up label throughout", () => {
    expect(HERO.trust).toBe(TRUST_LINE);
    expect(FINAL_CTA.trust).toBe(TRUST_LINE);
    expect(HERO.primary).toBe(TRIAL_CTA);
    expect(FINAL_CTA.primary).toBe(TRIAL_CTA);
    expect(PRICING.cta).toBe(TRIAL_CTA);
  });

  /**
   * No other trial length may be visible, in any market.
   *
   * Written as "every day-count in the copy is the trial's" rather than as a
   * search for "30", because the next wrong number will not be 30. Day counts
   * spelled out in words — the AU note's "seven business days" — are not
   * caught and do not need to be: they are about Payday Super, not about
   * Clarivo's trial.
   */
  it("names no other number of days anywhere in the copy", () => {
    const offenders = everyCopyString()
      .flatMap((line) => [...line.matchAll(/(\d[\d,]*)[\s-]?days?\b/gi)])
      .filter((match) => match[1] !== String(TRIAL_DAYS))
      .map((match) => match[0]);

    expect(offenders).toEqual([]);
  });

  it("states the trial in the FAQ answer every market reads", () => {
    const answer = (currency: content.Currency) =>
      marketFaq(currency).find((item) => item.id === "cost")?.a ?? "";

    expect(money(answer("EUR"), "EUR")).toBe(
      "Every plan starts with a 14-day free trial, with no credit card. After the trial, plans run from €29 to €49 a month by company size. Over 2,000 employees is Enterprise, priced on request.",
    );
    // Australia's own figures and its own tax, same trial.
    expect(money(answer("AUD"), "AUD")).toBe(
      "Every plan starts with a 14-day free trial, with no credit card. After the trial, plans run from A$49 to A$79 a month by company size, excluding GST. Over 2,000 employees is Enterprise, priced on request.",
    );
  });

  /**
   * And no surface still offers the beta instead.
   *
   * `/llms.txt` is the one that matters most here: an assistant quotes it to
   * somebody who never visits the site, so "free during the beta" or "access is
   * by invitation" there would turn away the one reader who was ready to start.
   * The product is still described as being in beta, which is true and is not
   * what this checks.
   */
  it("offers nobody a free beta or an invitation, on the page or in llms.txt", async () => {
    const llms = await llmsTxt().text();
    const surfaces = [...everyCopyString(), llms];

    for (const line of surfaces) {
      expect(line).not.toMatch(/free (during|in|while) the beta|free in beta/i);
      expect(line).not.toMatch(/early access|waiting list|by invitation/i);
    }

    expect(llms).toContain(TRIAL);
    expect(llms).toContain(`${content.SITE.url}/sign-up`);
  });
});

describe("the euro and dollar pages", () => {
  it("read one object, so they cannot drift apart", () => {
    expect(MARKETS.EUR).toBe(MARKETS.USD);
  });

  it("keep the shared copy they had before Australia existed", () => {
    expect(marketFaq("EUR")).toEqual(FAQ.items.map(({ id, q, a }) => ({ id, q, a })));
    expect(market("USD").problem).toBeNull();
    expect(market("USD").note).toBeNull();
    expect(planPrices(PRICING.plans[0], "USD").listMonthly).toBe("¤29");
    expect(planPrices(PRICING.plans[1], "USD").listMonthly).toBe("¤49");
  });
});
