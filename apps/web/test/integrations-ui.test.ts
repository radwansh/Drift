import { describe, it, expect } from "vitest";
import { NAV_ITEMS, visibleNavItems } from "@/lib/constants";
import { INTEGRATION_PLANS, PLAN_IDS, hasIntegrations, type PlanId } from "@/lib/plans";
import { PAY_DETAIL_ROLES } from "@/lib/roles";
import {
  INTEGRATION_PROVIDERS,
  mergeIntegrations,
} from "@/components/integrations/providers";

/**
 * The plan axis on the sidebar, and the merge behind the integrations page.
 *
 * `test/employee-file-ui.test.ts` holds the role axis and is untouched — four
 * of its assertions call `visibleNavItems(role)` with one argument and count
 * the items, which is the contract this axis had to be added without
 * breaking. That is asserted here too, from the other side.
 */

const EVERY_PLAN: readonly (PlanId | null)[] = [...PLAN_IDS, null];

describe("the sidebar's plan axis", () => {
  it("gates Integrations on plans, and nothing else", () => {
    const gated = NAV_ITEMS.filter((item) => item.plans);
    expect(gated.map((item) => item.href)).toEqual(["/integrations"]);
    expect(gated[0]?.plans).toEqual([...INTEGRATION_PLANS]);
  });

  /**
   * A plan is not a role. Overloading `roles` with plan ids would run them
   * through `canReadPayDetail`, a predicate about people, and would make
   * "admin" and "enterprise" members of one list.
   */
  it("keeps the two axes separate on the item that carries each", () => {
    const integrations = NAV_ITEMS.find((item) => item.href === "/integrations");
    expect(integrations?.roles).toBeUndefined();
    const employeeFile = NAV_ITEMS.find((item) => item.href === "/employees");
    expect(employeeFile?.plans).toBeUndefined();
    expect(employeeFile?.roles).toEqual([...PAY_DETAIL_ROLES]);
  });

  it("shows Integrations on Enterprise", () => {
    const hrefs = visibleNavItems("admin", "enterprise").map((item) => item.href);
    expect(hrefs).toContain("/integrations");
    expect(hrefs).toHaveLength(NAV_ITEMS.length);
  });

  /**
   * The consequence worth stating: nothing in the app writes
   * `companies.settings.plan`, so every company is "free" and the entry is
   * hidden from everyone — the owner included.
   */
  it("hides it on every other plan, and on an unresolved one", () => {
    for (const plan of EVERY_PLAN) {
      if (plan === "enterprise") continue;
      const hrefs = visibleNavItems("admin", plan).map((item) => item.href);
      expect(hrefs, `plan ${String(plan)}`).not.toContain("/integrations");
      expect(hrefs).toHaveLength(NAV_ITEMS.length - 1);
    }
  });

  it("hides it from an Enterprise viewer's role-gated items but keeps the plan ones", () => {
    const hrefs = visibleNavItems("viewer", "enterprise").map((item) => item.href);
    // The two axes compose: a viewer loses the Employee File, not Integrations.
    expect(hrefs).not.toContain("/employees");
    expect(hrefs).toContain("/integrations");
  });

  it("loses both when the role and the plan are both unresolved", () => {
    const hrefs = visibleNavItems(null, null).map((item) => item.href);
    expect(hrefs).not.toContain("/employees");
    expect(hrefs).not.toContain("/integrations");
    expect(hrefs).toHaveLength(NAV_ITEMS.length - 2);
  });

  /**
   * An omitted plan is **not** `null`. Omitted means the caller knows nothing
   * about plans, and the axis does not filter — the one-argument contract
   * `employee-file-ui.test.ts` pins. The page is the real gate either way.
   */
  it("does not filter on plan when no plan is passed", () => {
    expect(visibleNavItems("admin").map((item) => item.href)).toContain("/integrations");
    expect(visibleNavItems("admin")).toHaveLength(NAV_ITEMS.length);
    expect(visibleNavItems("viewer")).toHaveLength(NAV_ITEMS.length - 1);
  });

  it("agrees with the predicate the page gates itself with", () => {
    const integrations = NAV_ITEMS.find((item) => item.href === "/integrations");
    for (const plan of EVERY_PLAN) {
      const shown = visibleNavItems("admin", plan).includes(integrations!);
      expect(shown, `plan ${String(plan)}`).toBe(hasIntegrations(plan));
    }
    // And an unresolved plan closes the capability rather than opening it.
    expect(hasIntegrations(null)).toBe(false);
    expect(hasIntegrations(undefined)).toBe(false);
  });
});

describe("the connector list is the database's, not a fixture's", () => {
  it("shows every catalogued provider as not connected when nothing is stored", () => {
    const merged = mergeIntegrations([]);
    expect(merged).toHaveLength(INTEGRATION_PROVIDERS.length);
    for (const entry of merged) {
      expect(entry.connected, `${entry.provider} with nothing stored`).toBe(false);
      expect(entry.connectedAt).toBeNull();
    }
    // The two the fixture used to light up for every company in the product.
    expect(merged.find((e) => e.provider === "sap")?.connected).toBe(false);
    expect(merged.find((e) => e.provider === "workday")?.connected).toBe(false);
  });

  it("marks a stored provider connected, with the timestamp configure wrote", () => {
    const merged = mergeIntegrations([
      { provider: "adp", connectedAt: "2026-06-20T14:30:00Z" },
    ]);
    const adp = merged.find((entry) => entry.provider === "adp");
    expect(adp?.connected).toBe(true);
    expect(adp?.connectedAt).toBe("2026-06-20T14:30:00Z");
  });

  /**
   * The rows are free-form JSON, so a value that cannot be a date must be left
   * unsaid rather than rendered — `formatDate` would throw on it, and a
   * caught one would print "Invalid Date" on a card.
   */
  it("refuses a connectedAt it cannot parse, without dropping the connection", () => {
    for (const value of ["", "soon", 1750000000000, null, undefined]) {
      const merged = mergeIntegrations([{ provider: "sage", connectedAt: value }]);
      const sage = merged.find((entry) => entry.provider === "sage");
      expect(sage?.connected, `connectedAt ${JSON.stringify(value)}`).toBe(true);
      expect(sage?.connectedAt).toBeNull();
    }
  });

  it("keeps a stored provider this build has no card for, so it can be disconnected", () => {
    const merged = mergeIntegrations([{ provider: "bamboo", connectedAt: "2026-01-01T00:00:00Z" }]);
    expect(merged).toHaveLength(INTEGRATION_PROVIDERS.length + 1);
    const extra = merged[merged.length - 1];
    expect(extra?.provider).toBe("bamboo");
    expect(extra?.connected).toBe(true);
  });

  it("ignores a row with no usable provider key", () => {
    const merged = mergeIntegrations([{ connectedAt: "2026-01-01T00:00:00Z" }, { provider: "" }]);
    expect(merged).toHaveLength(INTEGRATION_PROVIDERS.length);
    expect(merged.every((entry) => !entry.connected)).toBe(true);
  });
});
