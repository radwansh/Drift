import { describe, it, expect } from "vitest";
import { PRICING, money } from "@/components/marketing/content";
import {
  LIST_CURRENCY,
  planDisplayName,
  planPrice,
  pricingLadder,
} from "@/components/settings/pricing-ladder";
import { DEFAULT_PLAN, PLAN_IDS, parsePlan } from "@/lib/plans";

/**
 * The in-app billing page's plan ladder.
 *
 * The page it feeds showed three plans at $99 / $299 / Custom with
 * hand-written per-plan feature lists, while the marketing site sold Starter /
 * Growth / Enterprise at 29 / 49 / on request. `content.ts`'s header comment
 * names that failure mode exactly — two copies of the same numbers is how a
 * price drifts — so the ladder is derived from `PRICING` and this file is what
 * holds the derivation to it.
 */

describe("the ladder comes from PRICING", () => {
  const ladder = pricingLadder();

  /**
   * Pinned deliberately. A plan added to or renamed in `content.ts` fails here
   * rather than appearing on a customer's billing page unreviewed — the two
   * screens are meant to be changed together.
   */
  it("is Starter, Growth, Enterprise, in that order", () => {
    expect(ladder.map((rung) => rung.name)).toEqual(["Starter", "Growth", "Enterprise"]);
  });

  it("gives every rung an id the plan vocabulary recognises", () => {
    for (const rung of ladder) {
      expect(rung.id, `${rung.name} has no id in PLAN_IDS`).not.toBeNull();
      expect(PLAN_IDS).toContain(rung.id);
    }
  });

  it("sells each rung by its employee band, from PRICING", () => {
    expect(ladder[0]?.audience).toBe("Up to 500 employees");
    expect(ladder[1]?.audience).toBe("Up to 2,000 employees");
    expect(ladder[2]?.audience).toMatch(/over 2,000 employees/i);
  });

  /**
   * `\s` rather than a literal space: `Intl.NumberFormat` with
   * `currencyDisplay: "code"` separates the code from the figure with U+00A0,
   * a non-breaking space, so `toBe("EUR 29.00")` typed with an ordinary space
   * fails on two strings that look identical in the diff.
   */
  it("carries the 29/49 ladder and its founder half", () => {
    expect(ladder[0]?.listPrice).toMatch(/^EUR\s29\.00$/);
    expect(ladder[0]?.founderPrice).toMatch(/^EUR\s14\.00$/);
    expect(ladder[1]?.listPrice).toMatch(/^EUR\s49\.00$/);
    expect(ladder[1]?.founderPrice).toMatch(/^EUR\s24\.00$/);
  });

  it("prices Enterprise on request, with no figure at all", () => {
    const enterprise = ladder[2];
    expect(enterprise?.listPrice).toBeNull();
    expect(enterprise?.founderPrice).toBeNull();
    expect(enterprise?.onRequest).toBe("On request");
  });

  /**
   * The same numerals as the marketing page renders, from the same stored
   * string. `money()` substitutes a symbol for the site; the app formats with
   * a code. If the two ever disagree it is because someone retyped one.
   */
  it("shows the same numbers the marketing page does", () => {
    for (const plan of PRICING.plans) {
      for (const stored of [plan.listMonthly, plan.founderMonthly]) {
        const numerals = stored.replace(/[^\d]/g, "");
        expect(planPrice(stored)).toContain(numerals);
        expect(money(stored, LIST_CURRENCY)).toContain(numerals);
      }
    }
  });
});

describe("money on the billing page (CLAUDE.md's formatter rule)", () => {
  /**
   * `PRICING` stores `¤29` because the marketing page renders `€29`. Every
   * figure in the app goes through `formatCurrency`, so the placeholder must
   * never reach the screen and neither must a bare symbol.
   */
  it("renders a currency code, never a symbol or the placeholder", () => {
    for (const rung of pricingLadder()) {
      for (const figure of [rung.listPrice, rung.founderPrice]) {
        if (figure === null) continue;
        expect(figure).toContain(LIST_CURRENCY);
        expect(figure).not.toContain("¤");
        expect(figure).not.toContain("€");
        expect(figure).not.toContain("$");
      }
    }
  });

  it("formats in the market currency the ladder is quoted in, not the payroll one", () => {
    // A company's own `currencyCode` is never the source here: the ladder is a
    // list price per market, not a conversion.
    expect(planPrice("¤29", "USD")).toMatch(/^USD\s29\.00$/);
    expect(planPrice("¤29")).toMatch(/^EUR\s29\.00$/);
  });

  it("parses the stored shape, separators included, and refuses a non-figure", () => {
    expect(planPrice("¤1,490")).toMatch(/^EUR\s1,490\.00$/);
    expect(planPrice("On request")).toBeNull();
    expect(planPrice("")).toBeNull();
  });
});

describe("the plan a company is recorded on", () => {
  it("defaults to free, which is what every company reads today", () => {
    expect(DEFAULT_PLAN).toBe("free");
    expect(parsePlan(undefined)).toBeNull();
    expect(parsePlan("free")).toBe("free");
  });

  it("accepts the published ids, however they are cased", () => {
    expect(parsePlan("Starter")).toBe("starter");
    expect(parsePlan(" GROWTH ")).toBe("growth");
    expect(parsePlan("Enterprise")).toBe("enterprise");
    expect(parsePlan("Bureau")).toBe("bureau");
  });

  /**
   * An unknown value must not become "free". "Free" is a real answer with its
   * own sentence on the page — "free while it is in beta" — and saying it to a
   * company on something else would be a statement about money that is wrong.
   */
  it("refuses to guess at a value it does not know", () => {
    for (const value of ["professional", "", null, 299, {}]) {
      expect(parsePlan(value)).toBeNull();
    }
  });

  it("names a recognised plan from PRICING and an unrecognised one verbatim", () => {
    expect(planDisplayName("free", "free")).toMatch(/beta/i);
    expect(planDisplayName("growth", "growth")).toBe("Growth");
    expect(planDisplayName("enterprise", "enterprise")).toBe("Enterprise");
    expect(planDisplayName("bureau", "bureau")).toBe("Bureau");
    expect(planDisplayName(null, "professional")).toBe("professional");
  });
});
