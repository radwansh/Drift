import { describe, it, expect } from "vitest";
import {
  COMPANY_NAME_MAX,
  COMPANY_NAME_MIN,
  COUNTRIES,
  FISCAL_MONTH_HINTS,
  INDUSTRIES,
  INVITE_LEVELS,
  MONTH_NAMES,
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  OWN_EMAIL_REFUSAL,
  companyNameError,
  countryName,
  defaultCurrencyForCountry,
  defaultFiscalMonthForCountry,
  inviteEmailError,
  isCountryCode,
  isIndustry,
  isPlaceholderCompanyName,
  onboardingStepOf,
} from "@/lib/onboarding-options";

/**
 * The vocabularies and the two derivations the five-step onboarding is built
 * from.
 *
 * These are pure functions in `lib/`, shared by the client and the server for
 * one reason: the currency the screen pre-selects and the currency the router
 * accepts have to be the same rule. A second copy would be the shape of bug
 * where the step offers AUD and the row ends up USD, which nobody notices until
 * a year of figures is labelled wrongly.
 */

describe("country to currency", () => {
  /** The brief's rule, case by case. */
  it.each([
    ["AU", "AUD"],
    ["US", "USD"],
    ["GB", "GBP"],
  ])("maps %s to %s", (code, currency) => {
    expect(defaultCurrencyForCountry(code)).toBe(currency);
  });

  it.each(["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"])(
    "maps the euro-area member %s to EUR",
    (code) => {
      expect(defaultCurrencyForCountry(code)).toBe("EUR");
    },
  );

  it("counts twenty euro-area members and no more", () => {
    const euro = COUNTRIES.filter((c) => defaultCurrencyForCountry(c.code) === "EUR");
    expect(euro).toHaveLength(20);
  });

  /**
   * Everything else falls to USD, which is what the brief says and what
   * `companies.currency_code` already defaults to. It is a suggestion on a step
   * whose whole purpose is to be confirmed, so a country paid in something else
   * costs one dropdown rather than a wrong stored value.
   */
  it.each(["CA", "JP", "ZA", "LB", "CH", "SE", "ME", "MC"])(
    "falls back to USD for %s",
    (code) => {
      expect(defaultCurrencyForCountry(code)).toBe("USD");
    },
  );

  it("falls back to USD for no country at all, rather than throwing", () => {
    expect(defaultCurrencyForCountry(null)).toBe("USD");
    expect(defaultCurrencyForCountry(undefined)).toBe("USD");
    expect(defaultCurrencyForCountry("")).toBe("USD");
    expect(defaultCurrencyForCountry("ZZ")).toBe("USD");
  });

  /** Codes are upper-case; a lower-case one is not a code and must not match. */
  it("does not match a lower-case code", () => {
    expect(defaultCurrencyForCountry("au")).toBe("USD");
    expect(isCountryCode("au")).toBe(false);
  });
});

describe("country to fiscal start month", () => {
  it("starts Australia's year in July", () => {
    expect(defaultFiscalMonthForCountry("AU")).toBe(7);
  });

  it.each(["US", "GB", "DE", "IN", "NZ", "ZA"])("starts %s in January", (code) => {
    expect(defaultFiscalMonthForCountry(code)).toBe(1);
  });

  it("starts in January when no country is known", () => {
    expect(defaultFiscalMonthForCountry(null)).toBe(1);
    expect(defaultFiscalMonthForCountry(undefined)).toBe(1);
  });

  /**
   * Every default has to be a month the engine can read:
   * `annual/fiscal.ts` labels a fiscal year by the calendar year it starts in
   * and bounds the month to 1..12.
   */
  it("only ever suggests a month in range, for every country in the list", () => {
    for (const country of COUNTRIES) {
      const month = defaultFiscalMonthForCountry(country.code);
      expect(Number.isInteger(month)).toBe(true);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });

  /** The three the brief names, and no invented fourth. */
  it("hints at January, April and July only", () => {
    expect(Object.keys(FISCAL_MONTH_HINTS).map(Number).sort((a, b) => a - b)).toEqual([1, 4, 7]);
    expect(FISCAL_MONTH_HINTS[1]).toBe("January (calendar year)");
    expect(FISCAL_MONTH_HINTS[4]).toBe("April (common in the UK and India)");
    expect(FISCAL_MONTH_HINTS[7]).toBe("July (common in Australia)");
  });

  it("names twelve months, starting at January", () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe("January");
    expect(MONTH_NAMES[11]).toBe("December");
  });
});

describe("the country list", () => {
  it("is ISO 3166-1 alpha-2: two upper-case letters, no duplicates", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(codes.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("is the whole standard rather than a curated handful", () => {
    // 249 assigned alpha-2 codes. A payroll product that cannot name the
    // country a customer runs payroll in has nothing to offer them.
    expect(COUNTRIES.length).toBe(249);
  });

  /**
   * Sorted the way a reader scans, not the way code points fall: an accented
   * initial sorts as its base letter, so the Åland Islands sit under A rather
   * than after Zimbabwe and Türkiye sits between Tunisia and Turkmenistan. The
   * locale is pinned so the assertion does not depend on the machine's default.
   */
  it("is sorted by name, which is the order the picker shows", () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("files accented names under their base letter", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(codes.indexOf("AX")).toBe(codes.indexOf("AF") + 1);
    expect(codes.indexOf("TR")).toBe(codes.indexOf("TN") + 1);
  });

  it("accepts a real code and refuses anything else", () => {
    expect(isCountryCode("AU")).toBe(true);
    expect(isCountryCode("GB")).toBe(true);
    for (const value of ["", "A", "AUS", "ZZ", "au", 42, null, undefined, {}]) {
      expect(isCountryCode(value)).toBe(false);
    }
  });

  it("names a country, and falls back to the code for one it does not know", () => {
    expect(countryName("AU")).toBe("Australia");
    expect(countryName("ZZ")).toBe("ZZ");
  });
});

describe("the industry list", () => {
  /** Exactly the thirteen from the brief, in order, with Other last. */
  it("is the thirteen the brief lists, in order", () => {
    expect(INDUSTRIES).toEqual([
      "Healthcare",
      "Manufacturing",
      "Retail",
      "Hospitality",
      "Construction",
      "Professional services",
      "Technology",
      "Education",
      "Logistics and transport",
      "Financial services",
      "Energy and utilities",
      "Public sector and non-profit",
      "Other",
    ]);
  });

  it("recognises its own members and nothing else", () => {
    expect(isIndustry("Healthcare")).toBe(true);
    expect(isIndustry("healthcare")).toBe(false);
    expect(isIndustry("Agriculture")).toBe(false);
    expect(isIndustry(null)).toBe(false);
  });
});

describe("company name bounds", () => {
  it("is 2 to 200 characters", () => {
    expect(COMPANY_NAME_MIN).toBe(2);
    expect(COMPANY_NAME_MAX).toBe(200);
  });

  it("refuses an empty or one-character name", () => {
    expect(companyNameError("")).toMatch(/at least 2/);
    expect(companyNameError("A")).toMatch(/at least 2/);
    // Whitespace is not a name: the bound is checked after trimming, which is
    // also what the router's `z.string().trim()` does.
    expect(companyNameError("   ")).toMatch(/at least 2/);
    expect(companyNameError(" A ")).toMatch(/at least 2/);
  });

  it("accepts the shortest real name and the longest", () => {
    expect(companyNameError("AB")).toBeNull();
    expect(companyNameError("a".repeat(200))).toBeNull();
    expect(companyNameError(` ${"a".repeat(200)} `)).toBeNull();
  });

  it("refuses one character too many", () => {
    expect(companyNameError("a".repeat(201))).toMatch(/at most 200/);
  });
});

describe("the placeholder company name step 1 replaces", () => {
  /**
   * `ensureUser` writes `"<name>'s company"` when Clerk gave it a name and
   * `"My company"` when it did not. Neither is a name the customer chose, so
   * step 1 opens with an empty field rather than inviting a Continue on it.
   */
  it("recognises both shapes ensureUser writes", () => {
    expect(isPlaceholderCompanyName("My company")).toBe(true);
    expect(isPlaceholderCompanyName("Dana's company")).toBe(true);
    expect(isPlaceholderCompanyName("Radwan Shebl's company")).toBe(true);
  });

  it("leaves a real name alone", () => {
    expect(isPlaceholderCompanyName("Acme Corp")).toBe(false);
    expect(isPlaceholderCompanyName("My Company Ltd")).toBe(false);
    expect(isPlaceholderCompanyName("Sainsbury's")).toBe(false);
  });
});

describe("the invitation address", () => {
  const own = "admin@acme.test";

  it("asks for an address when there is none", () => {
    expect(inviteEmailError("", own)).toMatch(/Enter their email address/);
    expect(inviteEmailError("   ", own)).toMatch(/Enter their email address/);
  });

  it.each(["not-an-email", "a@b", "a@@b.com", "a b@c.com", "@example.com", "person@"])(
    "refuses %s",
    (value) => {
      expect(inviteEmailError(value, own)).toBe("That is not an email address.");
    },
  );

  it("accepts an ordinary address, however it is cased or padded", () => {
    expect(inviteEmailError("accountant@example.com", own)).toBeNull();
    expect(inviteEmailError("  Accountant@Example.COM  ", own)).toBeNull();
    expect(inviteEmailError("first.last+payroll@sub.example.co.uk", own)).toBeNull();
  });

  /**
   * The admin's own address is refused before anything is sent. Inviting
   * yourself would mail you an invitation to a company you are already the
   * admin of, and `users.email` is UNIQUE, so the row would be refused anyway —
   * with a constraint violation instead of a sentence.
   */
  it("refuses the admin's own address, whatever the casing or padding", () => {
    expect(inviteEmailError(own, own)).toBe(OWN_EMAIL_REFUSAL);
    expect(inviteEmailError("ADMIN@ACME.TEST", own)).toBe(OWN_EMAIL_REFUSAL);
    expect(inviteEmailError(" admin@acme.test ", own)).toBe(OWN_EMAIL_REFUSAL);
    expect(inviteEmailError("admin@acme.test", " ADMIN@acme.test ")).toBe(OWN_EMAIL_REFUSAL);
  });

  it("does not mistake a different address at the same domain for the admin's", () => {
    expect(inviteEmailError("accounts@acme.test", own)).toBeNull();
  });
});

describe("the two access levels", () => {
  it("offers Accountant as manager and Viewer as viewer, and nothing else", () => {
    expect(INVITE_LEVELS.map((level) => [level.label, level.role])).toEqual([
      ["Accountant", "manager"],
      ["Viewer", "viewer"],
    ]);
  });

  /**
   * **This wording has to stay true.** `comparisons.getById` is a
   * `memberProcedure` and returns every `comparison_results` row — name, gross,
   * net, per-component deltas — to any signed-in member, and the Dashboard and
   * Detailed View are built on it. So a viewer does see employee-level pay, and
   * copy claiming otherwise would be a false promise on the very screen that
   * grants it. If somebody narrows that procedure, this test is where the copy
   * has to be revisited.
   */
  it("tells the truth about what a Viewer can see", () => {
    const viewer = INVITE_LEVELS.find((level) => level.role === "viewer");
    expect(viewer?.description).toBe(
      "Read-only, but can see employee-level pay on the Dashboard and Detailed View.",
    );
    expect(viewer?.description).not.toMatch(/no access|cannot see|without access/i);
  });

  it("says an Accountant can change settings, because manager is an EDITOR_ROLE", () => {
    const accountant = INVITE_LEVELS.find((level) => level.role === "manager");
    expect(accountant?.description).toMatch(/change company settings/i);
  });
});

describe("the step list and the progress marker", () => {
  it("has five steps, in the brief's order", () => {
    expect(ONBOARDING_STEP_COUNT).toBe(5);
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      "basics",
      "industry",
      "currency",
      "fiscal",
      "invite",
    ]);
    expect(ONBOARDING_STEPS.map((step) => step.label)).toEqual([
      "Company basics",
      "Industry",
      "Base currency",
      "Fiscal year",
      "Invite your accountant",
    ]);
  });

  /**
   * The marker comes out of free-form jsonb, so anything at all can be in
   * there. Reading it defensively is what keeps a hand-written value from
   * deciding which step a customer sees — or, worse, from being spent as a
   * number in SQL.
   */
  it("reads a sane step and clamps anything else to the range", () => {
    expect(onboardingStepOf({ onboardingStep: 3 })).toBe(3);
    expect(onboardingStepOf({ onboardingStep: 0 })).toBe(0);
    expect(onboardingStepOf({ onboardingStep: 5 })).toBe(5);
    expect(onboardingStepOf({ onboardingStep: 99 })).toBe(5);
    expect(onboardingStepOf({ onboardingStep: -4 })).toBe(0);
    expect(onboardingStepOf({ onboardingStep: 2.7 })).toBe(2);
  });

  it("reads anything unusable as nothing saved", () => {
    expect(onboardingStepOf({})).toBe(0);
    expect(onboardingStepOf(null)).toBe(0);
    expect(onboardingStepOf(undefined)).toBe(0);
    expect(onboardingStepOf({ onboardingStep: "3" })).toBe(0);
    expect(onboardingStepOf({ onboardingStep: null })).toBe(0);
    expect(onboardingStepOf({ onboardingStep: Number.NaN })).toBe(0);
    expect(onboardingStepOf({ onboardingStep: Number.POSITIVE_INFINITY })).toBe(0);
  });
});
