/**
 * Step 9, part 2: reading a register's non-money columns.
 *
 * The migration added `hire_date`, `termination_date`, `fte` and `dimensions`
 * to `employee_snapshots`. Getting a value into them means coercing whatever a
 * payroll export actually contains, and for dates that is a genuine hazard:
 * `03/04/2026` is the 3rd of April on a French register and the 4th of March on
 * an American one, and nothing in the cell says which. A wrong hire date is
 * worse than a missing one — it makes step 5's joiner check fire on the wrong
 * people and silently exonerate the right ones.
 *
 * So the order is inferred **per column, from every value in it**, never per
 * cell: one `25/12/2025` in the column proves the whole column is day-first.
 * When no value in the column settles it, the column is reported as ambiguous
 * and nothing is written — the same rule step 11 applies to an unclassifiable
 * component, for the same reason.
 *
 * Pure, like the rest of this package: it takes the raw cells and returns
 * values plus problems, and the caller decides whether to import, ask, or
 * refuse.
 */

/**
 * Defined in `@saas/types` and re-exported here, so a caller that already has
 * the readers does not need a second import. One definition only: it is also
 * the CHECK in migration 0010 and the `employee_snapshots` column names, and a
 * second copy would drift from them silently.
 */
import { SNAPSHOT_FIELDS, isSnapshotField, type SnapshotField } from "@saas/types";

export { SNAPSHOT_FIELDS, isSnapshotField, type SnapshotField };

/** What a column's two-part dates turned out to mean. */
export type DateOrder = "iso" | "dmy" | "mdy";

export type ColumnProblem =
  /** Two-part dates, and no value in the column says which part is the day. */
  | { code: "ambiguous_date_order"; samples: string[] }
  /** One value proves day-first and another proves month-first. */
  | { code: "inconsistent_date_order"; samples: string[] }
  /** Non-blank cells that are not readable at all. */
  | { code: "unreadable_values"; samples: string[] }
  /** Every FTE in the column is 10 or more, so the column is probably a percent. */
  | { code: "fte_looks_like_percent"; samples: string[] }
  /** An FTE that is not a positive number. The DB CHECK would reject it. */
  | { code: "fte_out_of_range"; samples: string[] };

export interface ColumnReading<T> {
  /** One entry per input cell, in order. `null` where nothing was written. */
  values: (T | null)[];
  /** Everything wrong with the column. Empty when it read cleanly. */
  problems: ColumnProblem[];
}

export interface DateColumnReading extends ColumnReading<string> {
  /** `null` when the column's order could not be settled, so nothing was read. */
  order: DateOrder | null;
}

/** How many distinct offending values a problem carries, to keep messages short. */
const MAX_SAMPLES = 3;

/**
 * Excel stores a date as days since 1899-12-30. Bounded deliberately: an
 * unbounded reading would turn a headcount of `2` into 1900-01-01, and a
 * payroll register has plenty of small integers in it. 20000 is 1954 and 80000
 * is 2119 — wide enough for any hire date, narrow enough that a quantity column
 * cannot wander in.
 */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
const MIN_EXCEL_SERIAL = 20_000;
const MAX_EXCEL_SERIAL = 80_000;

const ISO_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const PAIR_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/;
const SERIAL_RE = /^\d+(\.\d+)?$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function isoFromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function cellText(cell: unknown): string | null {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? null : isoFromUtc(cell.getTime());
  }
  const text = String(cell).trim();
  return text.length === 0 ? null : text;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A real calendar date, or null. Rejects 2026-02-30 rather than rolling it over. */
function calendarDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const back = new Date(Date.UTC(year, month - 1, day));
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** A cell after classification, before the column's order is known. */
type Classified =
  /** Settled on its own: ISO, an Excel serial, or a Date object. */
  | { kind: "fixed"; iso: string }
  /** Two small parts and a year. Which part is the day depends on the column. */
  | {
      kind: "pair";
      first: number;
      second: number;
      year: number;
      forces: DateOrder | null;
      text: string;
    }
  | { kind: "unreadable"; text: string };

function classify(text: string): Classified {
  const iso = ISO_RE.exec(text);
  if (iso) {
    const value = calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return value ? { kind: "fixed", iso: value } : { kind: "unreadable", text };
  }

  const pair = PAIR_RE.exec(text);
  if (pair) {
    const first = Number(pair[1]);
    const second = Number(pair[2]);
    const yearText = pair[3] ?? "";
    // A two-digit year is this century: a payroll register is not from 1926.
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    // Only a part above 12 can settle the order, and only one part can.
    const forces: DateOrder | null = first > 12 ? "dmy" : second > 12 ? "mdy" : null;
    return { kind: "pair", first, second, year, forces, text };
  }

  if (SERIAL_RE.test(text)) {
    const serial = Number(text);
    if (serial >= MIN_EXCEL_SERIAL && serial <= MAX_EXCEL_SERIAL) {
      return { kind: "fixed", iso: isoFromUtc(EXCEL_EPOCH_UTC + Math.floor(serial) * MS_PER_DAY) };
    }
    return { kind: "unreadable", text };
  }

  return { kind: "unreadable", text };
}

function samplesOf(texts: readonly string[]): string[] {
  return [...new Set(texts)].slice(0, MAX_SAMPLES);
}

function addUnreadable(problems: ColumnProblem[], texts: readonly string[]): void {
  if (texts.length === 0) return;
  const existing = problems.find((p) => p.code === "unreadable_values");
  if (existing) {
    existing.samples = samplesOf([...existing.samples, ...texts]);
  } else {
    problems.push({ code: "unreadable_values", samples: samplesOf(texts) });
  }
}

/**
 * Reads a whole date column. Returns one ISO value per input cell, `null` where
 * the cell was blank or the column could not be read, plus every problem found.
 *
 * Nothing is written for a column with an order problem: every value comes back
 * `null`, because a transposed date is worse than no date. A column that is
 * merely *partly* unreadable still imports the cells that did read — one bad
 * cell is not a reason to lose the other three hundred.
 */
export function readDateColumn(cells: readonly unknown[]): DateColumnReading {
  const classified = cells.map((cell) => {
    const text = cellText(cell);
    return text === null ? null : classify(text);
  });

  const problems: ColumnProblem[] = [];
  addUnreadable(
    problems,
    classified.flatMap((c) => (c !== null && c.kind === "unreadable" ? [c.text] : [])),
  );

  const pairs = classified.flatMap((c) =>
    c !== null && c.kind === "pair" ? [c] : [],
  );
  const forcedDmy = pairs.filter((p) => p.forces === "dmy");
  const forcedMdy = pairs.filter((p) => p.forces === "mdy");

  let order: DateOrder | null;
  if (pairs.length === 0) {
    // ISO, Excel serials, or nothing at all. There is no order to infer.
    order = "iso";
  } else if (forcedDmy.length > 0 && forcedMdy.length > 0) {
    problems.push({
      code: "inconsistent_date_order",
      samples: samplesOf([...forcedDmy, ...forcedMdy].map((p) => p.text)),
    });
    order = null;
  } else if (forcedDmy.length > 0) {
    order = "dmy";
  } else if (forcedMdy.length > 0) {
    order = "mdy";
  } else {
    // Every pair in the column reads either way. Refuse rather than pick one.
    problems.push({ code: "ambiguous_date_order", samples: samplesOf(pairs.map((p) => p.text)) });
    order = null;
  }

  if (order === null) {
    return { order, values: cells.map(() => null), problems };
  }

  const resolvedOrder = order;
  const unresolved: string[] = [];
  const values = classified.map((c) => {
    if (c === null || c.kind === "unreadable") return null;
    if (c.kind === "fixed") return c.iso;
    const day = resolvedOrder === "mdy" ? c.second : c.first;
    const month = resolvedOrder === "mdy" ? c.first : c.second;
    const value = calendarDate(c.year, month, day);
    if (value === null) unresolved.push(c.text);
    return value;
  });

  // A column that reads as day-first can still contain 31/13/2026. Report it
  // with the other unreadable cells rather than dropping it silently.
  addUnreadable(problems, unresolved);

  return { order, values, problems };
}

/**
 * Reads an FTE column. Accepts `1`, `0.5`, `0,5` and `50%`.
 *
 * A bare `50` is not read as 50% — that would be guessing a scale, and an FTE
 * of 50 is not a real contracted fraction either. Instead a column whose every
 * value is 10 or more is reported as probably a percentage and nothing is
 * written, so the caller can ask rather than store nonsense. Values that are
 * not positive are dropped and reported: the DB CHECK would reject them anyway.
 */
export function readFteColumn(cells: readonly unknown[]): ColumnReading<number> {
  const problems: ColumnProblem[] = [];
  const unreadable: string[] = [];
  const outOfRange: string[] = [];

  const values = cells.map((cell) => {
    const text = cellText(cell);
    if (text === null) return null;

    const percent = text.endsWith("%");
    const body = (percent ? text.slice(0, -1) : text).trim().replace(",", ".");
    if (!NUMBER_RE.test(body)) {
      unreadable.push(text);
      return null;
    }

    const value = percent ? Number(body) / 100 : Number(body);
    if (!(value > 0)) {
      outOfRange.push(text);
      return null;
    }
    return value;
  });

  addUnreadable(problems, unreadable);
  if (outOfRange.length > 0) {
    problems.push({ code: "fte_out_of_range", samples: samplesOf(outOfRange) });
  }

  const present = values.flatMap((v) => (v === null ? [] : [v]));
  if (present.length > 0 && present.every((v) => v >= 10)) {
    problems.push({
      code: "fte_looks_like_percent",
      samples: samplesOf(present.map(String)),
    });
    return { values: cells.map(() => null), problems };
  }

  return { values, problems };
}

/**
 * A reporting dimension's value: trimmed text, or null when the cell is blank.
 *
 * Capped, because `dimensions` is jsonb and a register's free-text notes column
 * mapped as a dimension would otherwise land whole rows of prose in it. 200 is
 * the length `department` already uses.
 */
export const MAX_DIMENSION_LENGTH = 200;

export function readDimensionValue(cell: unknown): string | null {
  const text = cellText(cell);
  if (text === null) return null;
  return text.length > MAX_DIMENSION_LENGTH ? text.slice(0, MAX_DIMENSION_LENGTH) : text;
}

/** What a header looks like it records. `null` when it looks like pay. */
export type SuggestedRole =
  | { kind: "snapshotField"; field: SnapshotField }
  | { kind: "dimension"; name: string };

interface RoleRule {
  /** All of these must appear in the normalised header, in any order. */
  words: readonly string[];
  role: SuggestedRole;
}

/**
 * Header rules, English and French, in the order they are tried.
 *
 * Termination comes before hire because "date de sortie" and "date d'entrée"
 * share "date", and a rule that matched "date" alone would claim both. FTE is
 * last because "taux" also appears in tax headers, so it needs the narrower
 * words to have failed first.
 *
 * Deliberately conservative: a suggestion the admin has to correct is worse
 * than no suggestion, because the mapping step is where they stop reading.
 */
const ROLE_RULES: readonly RoleRule[] = [
  { words: ["termination"], role: { kind: "snapshotField", field: "termination_date" } },
  { words: ["leaving", "date"], role: { kind: "snapshotField", field: "termination_date" } },
  { words: ["leave", "date"], role: { kind: "snapshotField", field: "termination_date" } },
  { words: ["exit", "date"], role: { kind: "snapshotField", field: "termination_date" } },
  { words: ["end", "date"], role: { kind: "snapshotField", field: "termination_date" } },
  { words: ["date", "sortie"], role: { kind: "snapshotField", field: "termination_date" } },
  { words: ["date", "depart"], role: { kind: "snapshotField", field: "termination_date" } },
  { words: ["date", "fin"], role: { kind: "snapshotField", field: "termination_date" } },

  { words: ["hire", "date"], role: { kind: "snapshotField", field: "hire_date" } },
  { words: ["hired"], role: { kind: "snapshotField", field: "hire_date" } },
  { words: ["joining", "date"], role: { kind: "snapshotField", field: "hire_date" } },
  { words: ["join", "date"], role: { kind: "snapshotField", field: "hire_date" } },
  { words: ["start", "date"], role: { kind: "snapshotField", field: "hire_date" } },
  { words: ["date", "embauche"], role: { kind: "snapshotField", field: "hire_date" } },
  { words: ["date", "entree"], role: { kind: "snapshotField", field: "hire_date" } },
  { words: ["seniority", "date"], role: { kind: "snapshotField", field: "hire_date" } },

  { words: ["fte"], role: { kind: "snapshotField", field: "fte" } },
  { words: ["full", "time", "equivalent"], role: { kind: "snapshotField", field: "fte" } },
  { words: ["etp"], role: { kind: "snapshotField", field: "fte" } },
  { words: ["taux", "activite"], role: { kind: "snapshotField", field: "fte" } },
  { words: ["taux", "occupation"], role: { kind: "snapshotField", field: "fte" } },

  { words: ["cost", "centre"], role: { kind: "dimension", name: "Cost Centre" } },
  { words: ["cost", "center"], role: { kind: "dimension", name: "Cost Centre" } },
  { words: ["centre", "cout"], role: { kind: "dimension", name: "Cost Centre" } },
  { words: ["location"], role: { kind: "dimension", name: "Location" } },
  { words: ["site"], role: { kind: "dimension", name: "Location" } },
  { words: ["branch"], role: { kind: "dimension", name: "Location" } },
  { words: ["agence"], role: { kind: "dimension", name: "Location" } },
  { words: ["job", "title"], role: { kind: "dimension", name: "Job Title" } },
  { words: ["position"], role: { kind: "dimension", name: "Job Title" } },
  { words: ["poste"], role: { kind: "dimension", name: "Job Title" } },
  { words: ["grade"], role: { kind: "dimension", name: "Grade" } },
  { words: ["echelon"], role: { kind: "dimension", name: "Grade" } },
  { words: ["contract", "type"], role: { kind: "dimension", name: "Contract Type" } },
  { words: ["type", "contrat"], role: { kind: "dimension", name: "Contract Type" } },
];

/**
 * Strips accents and punctuation so "Date d'entrée" and "DATE ENTREE" both
 * reach the same rule. Mirrors what `annual/classify.ts` does to a component
 * key, for the same reason.
 */
function normaliseHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Suggests what a register column records, from its header alone.
 *
 * Only a suggestion: the admin confirms it in the mapping step, which is why a
 * near-miss is left as pay rather than guessed at. Returns `null` for anything
 * no rule claims.
 */
export function suggestColumnRole(header: string): SuggestedRole | null {
  const normalised = normaliseHeader(header);
  if (normalised.length === 0) return null;
  const words = new Set(normalised.split(" "));
  for (const rule of ROLE_RULES) {
    if (rule.words.every((word) => words.has(word))) return rule.role;
  }
  return null;
}
