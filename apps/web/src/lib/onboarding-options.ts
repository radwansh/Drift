/**
 * The vocabularies the five-step onboarding is built from: the step list, the
 * ISO 3166-1 country list, the industry list, and the two defaults derived from
 * a country.
 *
 * **Dependency-free, and shared by the client and the server** — the same
 * reason `lib/plans.ts` and `lib/roles.ts` are. `components/onboarding/*` are
 * client components and `server/routers/onboarding.ts` validates the same
 * values; a second copy of the country-to-currency rule is a second thing to
 * forget, and the failure mode is a company whose screen offered AUD and whose
 * row says USD.
 *
 * Nothing here knows about the trial. `lib/entitlement.ts` owns that.
 */

/**
 * The five steps, in order, with the labels the stepper renders.
 *
 * `id` is what the client switches on; the index + 1 is the "Step N of 5"
 * number and the value stored in `settings.onboardingStep`.
 */
export const ONBOARDING_STEPS = [
  { id: "basics", label: "Company basics" },
  { id: "industry", label: "Industry" },
  { id: "currency", label: "Base currency" },
  { id: "fiscal", label: "Fiscal year" },
  { id: "invite", label: "Invite your accountant" },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

/**
 * How far the company got, as a step number from 0 (nothing saved) to 5.
 *
 * **It has to be stored rather than inferred.** Steps 1 and 4 leave a trace —
 * `settings.country` and `settings.fiscalStartMonth` are both absent until
 * somebody sets them — but step 2 is optional, step 3 has a default on the
 * column (`currency_code` is `NOT NULL DEFAULT 'USD'`) and step 5 can be
 * skipped outright. There is no state of the data that distinguishes "chose
 * USD" from "never saw the currency step", so "resume at the first incomplete
 * step" needs a marker of its own.
 *
 * Written only by `routers/onboarding.ts`, which is why it is not on
 * `settings.updateCompany`'s allow-list: that endpoint fails closed, so a
 * settings form cannot move a company's progress.
 */
export const ONBOARDING_STEP_KEY = "onboardingStep";

/** The company's progress, read defensively out of free-form jsonb. */
export function onboardingStepOf(settings: Record<string, unknown> | null | undefined): number {
  if (settings === null || typeof settings !== "object") return 0;
  const raw = settings[ONBOARDING_STEP_KEY];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.min(Math.max(Math.trunc(raw), 0), ONBOARDING_STEP_COUNT);
}

/**
 * The thirteen industries, exactly as the brief lists them.
 *
 * `Other` stays last. There is no "please select" entry: the step is optional
 * and the UI offers a "No industry" choice instead, so an empty value is a
 * deliberate answer rather than an unfilled field.
 */
export const INDUSTRIES = [
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
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export function isIndustry(value: unknown): value is Industry {
  return typeof value === "string" && (INDUSTRIES as readonly string[]).includes(value);
}

/**
 * ISO 3166-1 alpha-2, every assigned code, with the standard's short names.
 *
 * The whole list rather than a curated subset: a payroll product that cannot
 * name the country a customer runs payroll in has nothing to offer them, and
 * curating invites the question of who to leave out. The step filters as you
 * type, so the length costs nothing.
 *
 * Sorted by name, which is the order the picker shows and the order a reader
 * scanning for their own country expects.
 */
export const COUNTRIES = [
  { code: "AF", name: "Afghanistan" },
  // Å sorts as A, so the Åland Islands belong here rather than after Zimbabwe —
  // which is where a code-point sort puts them, and where nobody would look.
  { code: "AX", name: "Åland Islands" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AS", name: "American Samoa" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AI", name: "Anguilla" },
  { code: "AQ", name: "Antarctica" },
  { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AW", name: "Aruba" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BM", name: "Bermuda" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" },
  { code: "BQ", name: "Bonaire, Sint Eustatius and Saba" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BV", name: "Bouvet Island" },
  { code: "BR", name: "Brazil" },
  { code: "IO", name: "British Indian Ocean Territory" },
  { code: "BN", name: "Brunei Darussalam" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "CV", name: "Cabo Verde" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "KY", name: "Cayman Islands" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CX", name: "Christmas Island" },
  { code: "CC", name: "Cocos (Keeling) Islands" },
  { code: "CO", name: "Colombia" },
  { code: "KM", name: "Comoros" },
  { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo (Democratic Republic of the)" },
  { code: "CK", name: "Cook Islands" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CW", name: "Curaçao" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" },
  { code: "FK", name: "Falkland Islands" },
  { code: "FO", name: "Faroe Islands" },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GF", name: "French Guiana" },
  { code: "PF", name: "French Polynesia" },
  { code: "TF", name: "French Southern Territories" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GI", name: "Gibraltar" },
  { code: "GR", name: "Greece" },
  { code: "GL", name: "Greenland" },
  { code: "GD", name: "Grenada" },
  { code: "GP", name: "Guadeloupe" },
  { code: "GU", name: "Guam" },
  { code: "GT", name: "Guatemala" },
  { code: "GG", name: "Guernsey" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HM", name: "Heard Island and McDonald Islands" },
  { code: "VA", name: "Holy See" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IM", name: "Isle of Man" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JE", name: "Jersey" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "KP", name: "Korea (Democratic People's Republic of)" },
  { code: "KR", name: "Korea (Republic of)" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Lao People's Democratic Republic" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MO", name: "Macao" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" },
  { code: "MQ", name: "Martinique" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "YT", name: "Mayotte" },
  { code: "MX", name: "Mexico" },
  { code: "FM", name: "Micronesia" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MS", name: "Montserrat" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NC", name: "New Caledonia" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "NU", name: "Niue" },
  { code: "NF", name: "Norfolk Island" },
  { code: "MK", name: "North Macedonia" },
  { code: "MP", name: "Northern Mariana Islands" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PS", name: "Palestine" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PN", name: "Pitcairn" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "PR", name: "Puerto Rico" },
  { code: "QA", name: "Qatar" },
  { code: "RE", name: "Réunion" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russian Federation" },
  { code: "RW", name: "Rwanda" },
  { code: "BL", name: "Saint Barthélemy" },
  { code: "SH", name: "Saint Helena, Ascension and Tristan da Cunha" },
  { code: "KN", name: "Saint Kitts and Nevis" },
  { code: "LC", name: "Saint Lucia" },
  { code: "MF", name: "Saint Martin (French part)" },
  { code: "PM", name: "Saint Pierre and Miquelon" },
  { code: "VC", name: "Saint Vincent and the Grenadines" },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "Sao Tome and Principe" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SX", name: "Sint Maarten (Dutch part)" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "GS", name: "South Georgia and the South Sandwich Islands" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" },
  { code: "SJ", name: "Svalbard and Jan Mayen" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syrian Arab Republic" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" },
  { code: "TK", name: "Tokelau" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TN", name: "Tunisia" },
  // Likewise Ü sorts as U: Türkiye reads between Tunisia and Turkmenistan.
  { code: "TR", name: "Türkiye" },
  { code: "TM", name: "Turkmenistan" },
  { code: "TC", name: "Turks and Caicos Islands" },
  { code: "TV", name: "Tuvalu" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UM", name: "United States Minor Outlying Islands" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Viet Nam" },
  { code: "VG", name: "Virgin Islands (British)" },
  { code: "VI", name: "Virgin Islands (U.S.)" },
  { code: "WF", name: "Wallis and Futuna" },
  { code: "EH", name: "Western Sahara" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

const COUNTRY_CODES: ReadonlySet<string> = new Set(COUNTRIES.map((c) => c.code));

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && COUNTRY_CODES.has(value);
}

/** The country's name, or the code itself when it is not one we know. */
export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/**
 * The euro area: the twenty EU member states whose currency is the euro.
 *
 * The twenty as of Croatia's accession in 2023. Deliberately *only* the euro
 * area, so this reads as the brief's rule rather than as a judgement of its
 * own — Montenegro, Kosovo, Monaco, San Marino, Andorra and the Vatican also
 * pay in euro and fall to the `USD` default here. That is a default on a step
 * whose whole purpose is to be confirmed, not a figure anybody is stuck with.
 */
const EURO_AREA: ReadonlySet<string> = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);

/**
 * The currency to pre-select for a country.
 *
 * A **default**, never a conversion: `companies.currency_code` only labels the
 * figures a customer uploads, and nothing in the product converts anything. A
 * company paying in a currency this rule guesses wrong changes it on the step
 * the guess appears on.
 */
export function defaultCurrencyForCountry(code: string | null | undefined): string {
  if (code === "AU") return "AUD";
  if (code === "US") return "USD";
  if (code === "GB") return "GBP";
  if (typeof code === "string" && EURO_AREA.has(code)) return "EUR";
  return "USD";
}

/**
 * The fiscal-year start month to pre-select for a country: Australia's year
 * starts in July, everybody else's default is January.
 *
 * **A month, with no day.** `packages/payroll-core/src/annual/fiscal.ts` models
 * a start month and the annual engine has no notion of a start day, so offering
 * one would collect a number nothing can read. Australia's year famously starts
 * on 1 July, which is a month boundary, so nothing is lost here either.
 */
export function defaultFiscalMonthForCountry(code: string | null | undefined): number {
  return code === "AU" ? 7 : 1;
}

/** The twelve months, for the fiscal-year picker. */
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * The hint beside a month, for the three the brief names. Everything else gets
 * no hint rather than an invented one.
 */
export const FISCAL_MONTH_HINTS: Readonly<Record<number, string>> = {
  1: "January (calendar year)",
  4: "April (common in the UK and India)",
  7: "July (common in Australia)",
};

/**
 * The two access levels step 5 offers, and what each one can actually do.
 *
 * **The Viewer sentence is load-bearing and has to stay true.**
 * `comparisons.getById` is a `memberProcedure` that returns every
 * `comparison_results` row — name, gross, net, per-component deltas — to any
 * signed-in member, and the Dashboard and Detailed View are built on it. So a
 * viewer does see employee-level pay, and describing Viewer as "no access to
 * salaries" would be a false promise printed on the screen that grants it.
 * Narrowing that procedure is a product decision (CLAUDE.md says so in as many
 * words); until it is taken, this copy describes what the role really is.
 */
export const INVITE_LEVELS = [
  {
    role: "manager",
    label: "Accountant",
    description:
      "Uploads payroll files, runs comparisons, sees every employee's pay and can change company settings.",
  },
  {
    role: "viewer",
    label: "Viewer",
    description:
      "Read-only, but can see employee-level pay on the Dashboard and Detailed View.",
  },
] as const;

export type InviteRole = (typeof INVITE_LEVELS)[number]["role"];

/**
 * The company-name bounds, in one place because three callers check them: the
 * step's own error line, the router's zod schema, and the test that pins both.
 */
export const COMPANY_NAME_MIN = 2;
export const COMPANY_NAME_MAX = 200;

/**
 * Why a company name is not acceptable, or null when it is.
 *
 * Returns the sentence the step shows, so the client never has to render a
 * ZodError and the two sides cannot disagree about where the bounds are.
 */
export function companyNameError(raw: string): string | null {
  const name = raw.trim();
  if (name.length < COMPANY_NAME_MIN) {
    return `A company name is at least ${COMPANY_NAME_MIN} characters.`;
  }
  if (name.length > COMPANY_NAME_MAX) {
    return `A company name is at most ${COMPANY_NAME_MAX} characters.`;
  }
  return null;
}

/**
 * The refusal when an admin types their own address into step 5.
 *
 * One constant because two sides refuse it: the step, under the field, and
 * `onboarding.inviteAccountant`, which must refuse it whatever the client did.
 * Inviting yourself would send you an invitation to join a company you are
 * already the admin of, and the `users.email` UNIQUE constraint would then
 * refuse the row — so the readable refusal has to come first.
 */
export const OWN_EMAIL_REFUSAL =
  "That is your own address. Invite your accountant's address instead.";

/**
 * Why an invitation address is not acceptable, or null when it is.
 *
 * Deliberately a shape check and nothing more: an address either parses or it
 * does not, and whether anybody reads it is Clerk's question, answered when the
 * invitation is actually sent. `sendClerkInvitation`'s refusal is what surfaces
 * an address Clerk will not take.
 */
export function inviteEmailError(raw: string, ownEmail: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length === 0) return "Enter their email address, or tick “I’ll do this later”.";
  if (!/^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/.test(email)) return "That is not an email address.";
  if (email === ownEmail.trim().toLowerCase()) return OWN_EMAIL_REFUSAL;
  return null;
}

/**
 * The placeholder names `ensureUser` creates, which step 1 exists to replace.
 *
 * It writes `"<name>'s company"` when Clerk gave it a name and `"My company"`
 * when it did not. Neither is a name the customer chose, so the step pre-fills
 * an empty field instead of inviting somebody to press Continue on it.
 */
export function isPlaceholderCompanyName(name: string): boolean {
  return name === "My company" || /'s company$/.test(name);
}
