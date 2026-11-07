import type { ListSort } from "./employee-list-url";

/**
 * The list's column model (step E4).
 *
 * Plain `.ts`, not `.tsx`, and that is load-bearing: `apps/web/tsconfig.json`
 * sets `jsx: "preserve"`, so a vitest module importing JSX from a `.tsx` file is
 * left with unparsed JSX at runtime. Keeping the model — keys, labels,
 * comparators, availability rules — out of the rendering file is what makes
 * `employee-file-ui.test.ts` able to assert any of it.
 *
 * Per finding F1 this is a **new** picker rather than a reuse of
 * `components/detailed-view/column-picker.tsx`: that component's model is
 * `{component, visible, mode}` where `mode` is
 * `current | previous | side_by_side | delta_only`, which is comparison
 * semantics with no meaning for a list column, so reusing it would render four
 * meaningless mode buttons per column. And nothing is persisted in `saved_views`
 * — that table is dead schema; preferences live in `localStorage`.
 */

/** One row of `employeeFile.list`'s `employees` array, as the table reads it. */
export interface EmployeeListRow {
  externalId: string;
  name: string | null;
  department: string;
  paidPeriods: number;
  coveredSlots: number;
  rangeGross: number;
  latestGross: number;
  latestNet: number;
  lastPaidSlotLabel: string | null;
  lastPaidSlotIndex: number | null;
  terminationDate: string | null;
  criticalFlags: number;
  netExceedsGrossRows: number;
  negativeNetRows: number;
  hasDuplicateRows: boolean;
  /**
   * Null means **unknown for this range**, not "has left".
   *
   * The predicate reads the latest covered slot's rows, and that slot can sit
   * outside the selected range, in which case the question cannot be answered
   * from what was queried. `listStatus` renders the three cases separately.
   */
  currentlyEmployed: boolean | null;
  paidInRange: boolean;
  /**
   * Column 11 of spec 3.2 — now projected by `employeeFile.list` as one more
   * aggregate in the page query, which is what makes the availability rule
   * below a real condition rather than a permanently false one.
   *
   * Still optional on the row so the rule stays testable in both directions.
   */
  fte?: number | null;
  /**
   * Column 12, still deferred (finding F9): no register in the product carries
   * a dimension today, and `employeeFile.list` projects no per-employee value.
   */
  dimensions?: Readonly<Record<string, string>>;
}

export type EmployeeColumnKey =
  | "employee"
  | "status"
  | "flags"
  | "department"
  | "lastPaidSlot"
  | "latestGross"
  | "latestNet"
  | "paidPeriods"
  | "rangeGross"
  | "fte";

export interface EmployeeColumnDef {
  key: EmployeeColumnKey;
  label: string;
  /** What the column counts or covers. Shown in the picker, not only on hover. */
  note?: string;
  align: "left" | "right";
  /** Columns 1-9 of spec 3.2, in its order. */
  defaultVisible: boolean;
  /** The identity column cannot be hidden: a row with no name is unusable. */
  locked?: boolean;
  /**
   * The server-side sort this column maps onto, when it has one. A column with
   * none sorts on the current page only, and the header says so — sorting one
   * page of a paginated set and presenting it as the order of the whole set is
   * the same class of lie as a filter that drops rows without saying how many.
   */
  sort?: ListSort;
  /** N-priority columns render only when some row in scope carries the data. */
  availableWhen?: (rows: readonly EmployeeListRow[]) => boolean;
}

/**
 * Columns 1-9 default-visible in the spec's order, then the deferred ones.
 *
 * Column 3's label says **which** flags it counts, per finding F5: the list's
 * flags are the three SQL-expressible ones (net above gross, negative net, and
 * the duplicate-row marker). The two identity breaches — earnings not tying to
 * gross, deductions not tying to net — need the TypeScript classifier and live
 * on the file page. A header reading just "Flags" would imply the full set.
 */
export const EMPLOYEE_COLUMNS: readonly EmployeeColumnDef[] = [
  {
    key: "employee",
    label: "Employee",
    note: "Name, with the external id beneath it.",
    align: "left",
    defaultVisible: true,
    locked: true,
    sort: "name",
  },
  {
    key: "status",
    label: "Status",
    note: "Active, or left with the slot it is derived from.",
    align: "left",
    defaultVisible: true,
  },
  {
    key: "flags",
    label: "Critical flags",
    note: "Net above gross, negative net, and more than one row in a period. The identity checks are on the file.",
    align: "right",
    defaultVisible: true,
    sort: "flags",
  },
  {
    key: "department",
    label: "Department",
    note: "The latest in range. One person can hold several across a year.",
    align: "left",
    defaultVisible: true,
  },
  {
    key: "lastPaidSlot",
    label: "Last paid slot",
    note: "The slot label, never a raw date — it is what tells a leaver from a gap in uploads.",
    align: "left",
    defaultVisible: true,
  },
  {
    key: "latestGross",
    label: "Latest gross",
    align: "right",
    defaultVisible: true,
    sort: "latest_gross",
  },
  { key: "latestNet", label: "Latest net", align: "right", defaultVisible: true },
  {
    key: "paidPeriods",
    label: "Paid periods",
    note: "Paid of covered slots in range. The denominator, on the face of the list.",
    align: "right",
    defaultVisible: true,
    sort: "paid_periods",
  },
  {
    key: "rangeGross",
    label: "Range gross",
    note: "Summed over the slots this person was paid in.",
    align: "right",
    defaultVisible: true,
    sort: "range_gross",
  },
  {
    key: "fte",
    label: "FTE",
    note: "The latest in range. Only when a register in scope maps an FTE column.",
    align: "right",
    defaultVisible: false,
    availableWhen: (rows) => rows.some((row) => row.fte !== null && row.fte !== undefined),
  },
];

/** At most five dimension columns, per finding F9. */
export const MAX_DIMENSION_COLUMNS = 5;

/**
 * The dimension columns that have data, highest coverage first.
 *
 * `dimensions` is open-ended, so a register with eight keys would otherwise
 * produce eight extra columns. Capped at five by non-null coverage; the rest
 * stay in the picker's "not shown" list rather than disappearing silently.
 */
export function dimensionColumns(
  rows: readonly EmployeeListRow[],
  keys: readonly string[],
): { key: string; covered: number }[] {
  return keys
    .map((key) => ({
      key,
      covered: rows.filter((row) => {
        const value = row.dimensions?.[key];
        return value !== undefined && value !== "";
      }).length,
    }))
    .filter((entry) => entry.covered > 0)
    .sort((a, b) => b.covered - a.covered || a.key.localeCompare(b.key))
    .slice(0, MAX_DIMENSION_COLUMNS);
}

/** Which fixed columns can render at all, given the rows in scope. */
export function availableColumns(
  rows: readonly EmployeeListRow[],
): readonly EmployeeColumnDef[] {
  return EMPLOYEE_COLUMNS.filter((col) => !col.availableWhen || col.availableWhen(rows));
}

/**
 * The keys to render: the saved preference where there is one, intersected with
 * what the data supports, with the locked column always present.
 */
export function visibleColumnKeys(
  rows: readonly EmployeeListRow[],
  saved: readonly EmployeeColumnKey[] | null,
): EmployeeColumnKey[] {
  const allowed = availableColumns(rows);
  return allowed
    .filter((col) => col.locked || (saved ? saved.includes(col.key) : col.defaultVisible))
    .map((col) => col.key);
}

export const DEFAULT_COLUMN_KEYS: EmployeeColumnKey[] = EMPLOYEE_COLUMNS.filter(
  (col) => col.defaultVisible,
).map((col) => col.key);

/**
 * The list's employment status.
 *
 * Three values, not spec 3.2's five. `Joined <slot>` and `Rehired` need the
 * employee's own slot series — the first paid slot, and whether the paid slots
 * form one run or two — and the list query deliberately does not fetch per-slot
 * rows for every employee. Pulling them would mean every employee's every
 * slot's rows in Node on every list view, which is the cost finding F5 exists to
 * avoid. Both appear on the file page, where the series is already built.
 */
export type EmployeeListStatusKind = "active" | "left" | "not_paid_in_range" | "unknown";

export function listStatus(row: EmployeeListRow): {
  kind: EmployeeListStatusKind;
  label: string;
} {
  if (row.paidPeriods === 0) return { kind: "not_paid_in_range", label: "Not paid in range" };
  if (row.currentlyEmployed) return { kind: "active", label: "Active" };
  /**
   * Unknown is its own status, and it is the one that was wrong.
   *
   * Whether somebody is still employed is read off the latest covered slot, so
   * where the range does not reach that slot the router answers null rather
   * than false. Rendering null as `Left Feb 2026` put a leaving date on every
   * employee in the company, label and all, from one URL.
   */
  if (row.currentlyEmployed === null) {
    return { kind: "unknown", label: "Not known for this range" };
  }
  // Always naming the slot the status came from, never implying it.
  return {
    kind: "left",
    label: row.lastPaidSlotLabel ? `Left ${row.lastPaidSlotLabel}` : "Left",
  };
}

/**
 * Comparators for the columns the server cannot sort.
 *
 * **Money sorts on the parsed number, never on the formatted string.** As text,
 * `"USD 9.00"` sorts above `"USD 10.00"`, and a pay list ordered that way looks
 * plausible enough to be believed. The row carries numbers because the router
 * parsed them at the boundary; these read those numbers and never a rendered
 * cell.
 */
export function compareByColumn(
  key: EmployeeColumnKey | `dim:${string}`,
): (a: EmployeeListRow, b: EmployeeListRow) => number {
  switch (key) {
    case "employee":
      return (a, b) => (a.name ?? a.externalId).localeCompare(b.name ?? b.externalId);
    case "status":
      return (a, b) => listStatus(a).label.localeCompare(listStatus(b).label);
    case "department":
      return (a, b) => a.department.localeCompare(b.department);
    case "lastPaidSlot":
      // By slot index, not by label: "Apr" before "Jan" is alphabetical order,
      // which is how a leaver ends up looking like the most recent payment.
      return (a, b) => (a.lastPaidSlotIndex ?? -1) - (b.lastPaidSlotIndex ?? -1);
    case "flags":
      return (a, b) => a.criticalFlags - b.criticalFlags;
    case "latestGross":
      return (a, b) => a.latestGross - b.latestGross;
    case "latestNet":
      return (a, b) => a.latestNet - b.latestNet;
    case "rangeGross":
      return (a, b) => a.rangeGross - b.rangeGross;
    case "paidPeriods":
      return (a, b) => a.paidPeriods - b.paidPeriods;
    case "fte":
      return (a, b) => (a.fte ?? -1) - (b.fte ?? -1);
    default: {
      const dimensionKey = key.slice("dim:".length);
      return (a, b) =>
        (a.dimensions?.[dimensionKey] ?? "").localeCompare(b.dimensions?.[dimensionKey] ?? "");
    }
  }
}

/**
 * Whether the rows on screen are the whole filtered set.
 *
 * A client-side sort of one page out of many orders that page, not the set, so
 * the header has to say "this page" when this is false.
 */
export function isWholeSetOnPage(total: number, rowCount: number): boolean {
  return rowCount >= total;
}
