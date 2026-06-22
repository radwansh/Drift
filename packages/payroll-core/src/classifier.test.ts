import { describe, it, expect } from "vitest";
import { classifyEmployeeStatus, classifyMatchedPairs } from "./classifier";
import type { EmployeeRecord, MatchedPair } from "./types";

describe("classifyEmployeeStatus", () => {
  it("returns unchanged when both null", () => {
    expect(classifyEmployeeStatus(null, null)).toBe("unchanged");
  });

  it("returns new when previous is null", () => {
    expect(classifyEmployeeStatus(5000, null)).toBe("new");
  });

  it("returns departed when current is null", () => {
    expect(classifyEmployeeStatus(null, 5000)).toBe("departed");
  });

  it("returns unchanged when diff is below threshold", () => {
    expect(classifyEmployeeStatus(5000, 5000)).toBe("unchanged");
    expect(classifyEmployeeStatus(5000.005, 5000)).toBe("unchanged");
  });

  it("returns increased when net increased", () => {
    expect(classifyEmployeeStatus(6000, 5000)).toBe("increased");
  });

  it("returns decreased when net decreased", () => {
    expect(classifyEmployeeStatus(4000, 5000)).toBe("decreased");
  });
});

describe("classifyMatchedPairs", () => {
  const baseCurrent: EmployeeRecord = {
    externalId: "1",
    name: "Alice",
    department: "Eng",
    components: { salary: 5000 },
    grossSalary: 5000,
    netSalary: 4500,
  };

  const basePrevious: EmployeeRecord = {
    externalId: "1",
    name: "Alice",
    department: "Eng",
    components: { salary: 5000 },
    grossSalary: 5000,
    netSalary: 4000,
  };

  it("classifies a matched pair correctly", () => {
    const pair: MatchedPair = {
      employeeExternalId: "1",
      employeeName: "Alice",
      department: "Eng",
      current: baseCurrent,
      previous: basePrevious,
      status: "unchanged",
    };

    const result = classifyMatchedPairs([pair]);
    expect(result[0].status).toBe("increased");
  });
});
