import { describe, it, expect } from "vitest";
import { NAV_ITEMS, visibleNavItems } from "@/lib/constants";
import { NAV_ICONS } from "@/components/shared/nav-icons";
import { PAY_DETAIL_ROLES, canReadPayDetail } from "@/lib/roles";

/**
 * The parts of the Employee File's UI layer that do not need a browser.
 *
 * This repo has no Playwright baselines and no browsers, so snapshot and axe
 * checks are out; `annual-ui.test.ts` follows the same rule. Phase E extends
 * this file with the chart series builder, the money sort comparators and the
 * conditional columns.
 */

describe("sidebar navigation (step A4)", () => {
  /**
   * The trap the spec names in section 1.3: the icon lookup is a literal, so an
   * item whose `icon` string is not a key renders no icon **and no error**.
   * Typecheck cannot see it, lint cannot see it, and a reviewer reading the diff
   * for the new entry has no reason to check the map. This is the one thing in
   * A4 that a review will not catch by eye.
   */
  it("gives every nav item an icon the registry actually has", () => {
    const names = Object.keys(NAV_ICONS);
    for (const item of NAV_ITEMS) {
      expect(names, `${item.label} (${item.href}) has icon "${item.icon}"`).toContain(item.icon);
    }
  });

  it("puts Employee File first, above Dashboard, with its roles set", () => {
    const first = NAV_ITEMS[0];
    expect(first?.href).toBe("/employees");
    expect(first?.label).toBe("Employee File");
    expect(first?.roles).toEqual([...PAY_DETAIL_ROLES]);
    // Above Dashboard, which is the decision rather than an accident of order.
    expect(NAV_ITEMS[1]?.href).toBe("/dashboard");
  });

  it("leaves the other six items ungated", () => {
    for (const item of NAV_ITEMS.slice(1)) {
      expect(item.roles, `${item.label} should not be gated`).toBeUndefined();
    }
  });

  it("shows the Employee File link to an admin and a manager", () => {
    for (const role of PAY_DETAIL_ROLES) {
      const hrefs = visibleNavItems(role).map((i) => i.href);
      expect(hrefs).toContain("/employees");
      expect(hrefs).toHaveLength(NAV_ITEMS.length);
    }
  });

  it("hides it from a viewer, and from an unresolved role", () => {
    // `null` is what the layout passes when the user lookup fails. A failure
    // must hide the link rather than render one that throws on click.
    for (const role of ["viewer", null, undefined, ""]) {
      const hrefs = visibleNavItems(role).map((i) => i.href);
      expect(hrefs, `role ${JSON.stringify(role)}`).not.toContain("/employees");
      expect(hrefs).toHaveLength(NAV_ITEMS.length - 1);
    }
  });

  /**
   * The link and the gate read the same constant, so they cannot disagree. If
   * `PAY_DETAIL_ROLES` ever changes, both move together and this holds.
   */
  it("agrees with the predicate the procedure enforces", () => {
    for (const item of NAV_ITEMS) {
      if (!item.roles) continue;
      for (const role of ["admin", "manager", "viewer", "", null]) {
        expect(visibleNavItems(role).includes(item)).toBe(canReadPayDetail(role));
      }
    }
  });
});
