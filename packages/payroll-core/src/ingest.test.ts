import { describe, it, expect } from "vitest";
import {
  suggestColumnRole,
  readDateColumn,
  readFteColumn,
  readDimensionValue,
  MAX_DIMENSION_LENGTH,
} from "./ingest";

describe("readDateColumn — the order comes from the column, not the cell", () => {
  it("reads ISO without needing to infer anything", () => {
    const r = readDateColumn(["2025-03-04", "2026-12-31", "2024-01-01"]);
    expect(r.order).toBe("iso");
    expect(r.values).toEqual(["2025-03-04", "2026-12-31", "2024-01-01"]);
    expect(r.problems).toEqual([]);
  });

  it("infers day-first from one unambiguous value, and applies it to the rest", () => {
    // 03/04 alone is unreadable. 25/12 settles the whole column, which is the
    // entire point: per-cell guessing would read 03/04/2025 as 4 March.
    const r = readDateColumn(["03/04/2025", "25/12/2024", "01/02/2026"]);
    expect(r.order).toBe("dmy");
    expect(r.values).toEqual(["2025-04-03", "2024-12-25", "2026-02-01"]);
    expect(r.problems).toEqual([]);
  });

  it("infers month-first the same way", () => {
    const r = readDateColumn(["03/04/2025", "12/25/2024", "01/02/2026"]);
    expect(r.order).toBe("mdy");
    expect(r.values).toEqual(["2025-03-04", "2024-12-25", "2026-01-02"]);
    expect(r.problems).toEqual([]);
  });

  it("refuses a column where nothing settles the order, and writes nothing", () => {
    const r = readDateColumn(["03/04/2025", "01/02/2026", "11/12/2024"]);
    expect(r.order).toBeNull();
    // The refusal is the behaviour under test: every value is dropped, so a
    // transposed hire date can never reach the database.
    expect(r.values).toEqual([null, null, null]);
    expect(r.problems).toEqual([
      { code: "ambiguous_date_order", samples: ["03/04/2025", "01/02/2026", "11/12/2024"] },
    ]);
  });

  it("refuses a column that proves both orders", () => {
    const r = readDateColumn(["25/12/2024", "12/25/2024"]);
    expect(r.order).toBeNull();
    expect(r.values).toEqual([null, null]);
    expect(r.problems.map((p) => p.code)).toEqual(["inconsistent_date_order"]);
  });

  it("keeps the cells that read when only some are bad", () => {
    const r = readDateColumn(["25/12/2024", "n/a", "", "01/02/2026"]);
    expect(r.order).toBe("dmy");
    expect(r.values).toEqual(["2024-12-25", null, null, "2026-02-01"]);
    expect(r.problems).toEqual([{ code: "unreadable_values", samples: ["n/a"] }]);
  });

  it("reports an impossible date in an otherwise readable column", () => {
    const r = readDateColumn(["25/12/2024", "31/02/2025"]);
    expect(r.order).toBe("dmy");
    expect(r.values).toEqual(["2024-12-25", null]);
    expect(r.problems).toEqual([{ code: "unreadable_values", samples: ["31/02/2025"] }]);
  });

  it("accepts dots and dashes as separators", () => {
    const r = readDateColumn(["25.12.2024", "01-02-2026"]);
    expect(r.order).toBe("dmy");
    expect(r.values).toEqual(["2024-12-25", "2026-02-01"]);
  });

  it("reads a two-digit year as this century", () => {
    const r = readDateColumn(["25/12/24"]);
    expect(r.values).toEqual(["2024-12-25"]);
  });

  it("reads an Excel serial, and refuses a small integer that is not one", () => {
    // 45658 is 2025-01-01. A headcount of 2 must not become 1900-01-01, which
    // is what an unbounded serial reading would do.
    const r = readDateColumn([45658, 2]);
    expect(r.values).toEqual(["2025-01-01", null]);
    expect(r.problems).toEqual([{ code: "unreadable_values", samples: ["2"] }]);
  });

  it("reads a Date object, as xlsx hands back with raw: true", () => {
    const r = readDateColumn([new Date(Date.UTC(2025, 5, 30))]);
    expect(r.values).toEqual(["2025-06-30"]);
  });

  it("treats blanks as absent rather than as a problem", () => {
    const r = readDateColumn([null, undefined, "", "   "]);
    expect(r.values).toEqual([null, null, null, null]);
    expect(r.problems).toEqual([]);
    expect(r.order).toBe("iso");
  });

  it("returns one value per input cell, always", () => {
    for (const cells of [[], ["2025-01-01"], ["03/04/2025", "01/02/2026"], ["x", null, 45658]]) {
      expect(readDateColumn(cells).values).toHaveLength(cells.length);
    }
  });
});

describe("readFteColumn", () => {
  it("reads plain fractions", () => {
    const r = readFteColumn(["1", "0.5", "0.8"]);
    expect(r.values).toEqual([1, 0.5, 0.8]);
    expect(r.problems).toEqual([]);
  });

  it("reads a comma decimal and a percentage", () => {
    const r = readFteColumn(["0,5", "80%", "1"]);
    expect(r.values).toEqual([0.5, 0.8, 1]);
    expect(r.problems).toEqual([]);
  });

  it("allows above 1, which a register expressing overtime as FTE produces", () => {
    const r = readFteColumn(["1.25", "1"]);
    expect(r.values).toEqual([1.25, 1]);
    expect(r.problems).toEqual([]);
  });

  it("drops a non-positive value and reports it, matching the DB CHECK", () => {
    const r = readFteColumn(["1", "0", "-0.5"]);
    expect(r.values).toEqual([1, null, null]);
    expect(r.problems).toEqual([{ code: "fte_out_of_range", samples: ["0", "-0.5"] }]);
  });

  it("refuses a column that is plainly a percentage written without the sign", () => {
    // 50 and 100 as FTE are not contracted fractions. Writing them would make
    // cost per FTE a hundred times too small, which is worse than no FTE.
    const r = readFteColumn(["50", "100", "75"]);
    expect(r.values).toEqual([null, null, null]);
    expect(r.problems).toEqual([
      { code: "fte_looks_like_percent", samples: ["50", "100", "75"] },
    ]);
  });

  it("does not call it a percentage when a real fraction is present", () => {
    const r = readFteColumn(["50", "0.5"]);
    expect(r.values).toEqual([50, 0.5]);
    expect(r.problems).toEqual([]);
  });

  it("reports unreadable text", () => {
    const r = readFteColumn(["1", "full time"]);
    expect(r.values).toEqual([1, null]);
    expect(r.problems).toEqual([{ code: "unreadable_values", samples: ["full time"] }]);
  });
});

describe("readDimensionValue", () => {
  it("trims, and treats a blank as absent", () => {
    expect(readDimensionValue("  Beirut  ")).toBe("Beirut");
    expect(readDimensionValue("")).toBeNull();
    expect(readDimensionValue("   ")).toBeNull();
    expect(readDimensionValue(null)).toBeNull();
    expect(readDimensionValue(undefined)).toBeNull();
  });

  it("keeps a number as its text", () => {
    expect(readDimensionValue(4100)).toBe("4100");
  });

  it("caps a free-text cell rather than storing prose in jsonb", () => {
    const long = "x".repeat(MAX_DIMENSION_LENGTH + 50);
    expect(readDimensionValue(long)).toHaveLength(MAX_DIMENSION_LENGTH);
  });
});

describe("suggestColumnRole", () => {
  it("recognises hire-date headers, English and French", () => {
    for (const header of [
      "Hire Date",
      "hire date",
      "Date Hired",
      "Joining Date",
      "Start Date",
      "Date d'embauche",
      "DATE D ENTREE",
      "Date d'entrée",
      "Seniority Date",
    ]) {
      expect(suggestColumnRole(header), header).toEqual({
        kind: "snapshotField",
        field: "hire_date",
      });
    }
  });

  it("recognises termination-date headers, English and French", () => {
    for (const header of [
      "Termination Date",
      "termination",
      "Leaving Date",
      "Exit Date",
      "End Date",
      "Date de sortie",
      "Date de départ",
      "Date de fin",
    ]) {
      expect(suggestColumnRole(header), header).toEqual({
        kind: "snapshotField",
        field: "termination_date",
      });
    }
  });

  it("does not let the shared word 'date' claim the wrong field", () => {
    // "Date de sortie" and "Date d'entrée" differ by one word. A rule matching
    // "date" alone would map both to whichever came first in the table.
    expect(suggestColumnRole("Date de sortie")).toEqual({
      kind: "snapshotField",
      field: "termination_date",
    });
    expect(suggestColumnRole("Date d'entrée")).toEqual({
      kind: "snapshotField",
      field: "hire_date",
    });
  });

  it("recognises FTE headers", () => {
    for (const header of ["FTE", "fte", "Full Time Equivalent", "ETP", "Taux d'activité"]) {
      expect(suggestColumnRole(header), header).toEqual({ kind: "snapshotField", field: "fte" });
    }
  });

  it("recognises dimension headers and names them consistently", () => {
    expect(suggestColumnRole("Cost Centre")).toEqual({ kind: "dimension", name: "Cost Centre" });
    // Both spellings land on one name, so two companies' uploads aggregate.
    expect(suggestColumnRole("Cost Center")).toEqual({ kind: "dimension", name: "Cost Centre" });
    expect(suggestColumnRole("Centre de coût")).toEqual({ kind: "dimension", name: "Cost Centre" });
    expect(suggestColumnRole("Site")).toEqual({ kind: "dimension", name: "Location" });
    expect(suggestColumnRole("Branch")).toEqual({ kind: "dimension", name: "Location" });
    expect(suggestColumnRole("Job Title")).toEqual({ kind: "dimension", name: "Job Title" });
    expect(suggestColumnRole("Poste")).toEqual({ kind: "dimension", name: "Job Title" });
    expect(suggestColumnRole("Grade")).toEqual({ kind: "dimension", name: "Grade" });
    expect(suggestColumnRole("Type de contrat")).toEqual({
      kind: "dimension",
      name: "Contract Type",
    });
  });

  it("leaves pay columns alone", () => {
    for (const header of [
      "Basic Salary",
      "Gross Salary",
      "Net Salary",
      "Income Tax",
      "Salaire de base",
      "Employee ID",
      "Department",
      "Overtime",
      "Maladie",
      "",
      "   ",
    ]) {
      expect(suggestColumnRole(header), header).toBeNull();
    }
  });

  it("never claims a taxe or taux column that is really money", () => {
    // 'taux' is in plenty of rate columns. Only the narrower FTE phrases match.
    expect(suggestColumnRole("Taux de taxe")).toBeNull();
    expect(suggestColumnRole("Taux horaire")).toBeNull();
  });
});
