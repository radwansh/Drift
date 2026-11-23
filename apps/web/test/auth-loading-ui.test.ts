import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * The auth screens never show an empty right-hand column.
 *
 * **There is no DOM here.** `apps/web/vitest.config.ts` sets
 * `environment: "node"` and the repo has no jsdom and no React testing
 * library, so these are source assertions in the shape
 * `test/trial-paywall-ui.test.ts`, `test/billing-ui.test.ts` and
 * `test/annual-ui.test.ts` already use. What a source assertion can honestly
 * cover is a structural property — that the three Clerk state components are
 * present and that the form is inside the loaded one — and that is exactly
 * what the guarantee is made of.
 *
 * The bug: `AuthFrame` renders its Ink panel on the server, so the left half
 * paints at once, while `<SignIn>` / `<SignUp>` mount only after
 * `clerk.browser.js` has loaded in the browser. Measured cold against
 * production, that gap is ~0.9s unthrottled and ~3.4s on fast-3G — and for the
 * whole of it the right half was blank. It is the screen every "Start 14-day
 * free trial" button leads to, so a blank half reads as a broken product at
 * the exact moment someone decided to try it.
 */

const WEB_ROOT = path.resolve(import.meta.dirname, "..");

const read = (relative: string): string => fs.readFileSync(path.join(WEB_ROOT, relative), "utf8");

/** Comments are prose about the component, not the component. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const SCREENS = [
  ["sign-in", "src/app/(auth)/sign-in/[[...sign-in]]/page.tsx", "SignIn"],
  ["sign-up", "src/app/(auth)/sign-up/[[...sign-up]]/page.tsx", "SignUp"],
] as const;

describe.each(SCREENS)("/%s", (_name, file, component) => {
  const source = stripComments(read(file));

  it("covers all three Clerk states", () => {
    expect(source).toContain("<ClerkLoading>");
    expect(source).toContain("<ClerkLoaded>");
    expect(source).toContain("<ClerkFailed>");
  });

  it("shows a skeleton while Clerk is loading, not nothing", () => {
    const loading = source.match(/<ClerkLoading>([\s\S]*?)<\/ClerkLoading>/);
    expect(loading, "no <ClerkLoading> block").not.toBeNull();
    expect(loading![1]).toContain("<AuthFormSkeleton />");
  });

  it("says something when Clerk fails to load, rather than staying blank", () => {
    const failed = source.match(/<ClerkFailed>([\s\S]*?)<\/ClerkFailed>/);
    expect(failed, "no <ClerkFailed> block").not.toBeNull();
    expect(failed![1]).toContain("<AuthFormUnavailable />");
  });

  /**
   * The form must be *inside* `<ClerkLoaded>`. Rendering it as a sibling would
   * leave the skeleton and the real card on screen together — the blank is
   * gone but the page is now wrong, which is worse and would not be caught by
   * the assertions above.
   */
  it(`keeps <${component}> inside <ClerkLoaded>`, () => {
    const loaded = source.match(/<ClerkLoaded>([\s\S]*?)<\/ClerkLoaded>/);
    expect(loaded, "no <ClerkLoaded> block").not.toBeNull();
    expect(loaded![1]).toContain(`<${component}`);

    const outside = source.replace(/<ClerkLoaded>[\s\S]*?<\/ClerkLoaded>/, "");
    expect(outside).not.toContain(`<${component}`);
  });
});

describe("the fallbacks themselves", () => {
  const source = stripComments(read("src/components/shared/auth-form-fallback.tsx"));

  /**
   * The skeleton is decoration standing in for a form that is not there yet.
   * Announcing it would have a screen reader read out a card's worth of empty
   * boxes, and then read the real form when it arrives.
   */
  it("hides the skeleton from assistive technology", () => {
    const skeleton = source.match(/export function AuthFormSkeleton[\s\S]*?\n}/);
    expect(skeleton).not.toBeNull();
    expect(skeleton![0]).toContain('aria-hidden="true"');
  });

  /**
   * The failure message is the opposite: it is the only thing on screen and it
   * is the whole content. `Notice tone="danger"` carries `role="alert"`.
   */
  it("announces the failure", () => {
    const failed = source.match(/export function AuthFormUnavailable[\s\S]*/);
    expect(failed).not.toBeNull();
    expect(failed![0]).toContain('tone="danger"');
    expect(failed![0]).toMatch(/[Rr]eload/);
  });

  /** No hard-coded colours; `test/design-system.test.ts` enforces this repo-wide. */
  it("uses design-system tokens only", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).toContain("bg-cv-surface");
  });
});

/**
 * `ClerkLoading`, `ClerkLoaded` and `ClerkFailed` are Clerk's, not ours, and a
 * version bump is what would quietly remove one — leaving a screen that
 * renders neither the skeleton nor the form. Pinned against the installed
 * package rather than our own source, which is the convention
 * `trial-paywall-ui.test.ts` set for a guarantee that belongs to a dependency.
 */
describe("the Clerk state components exist", () => {
  it("are exported by the installed @clerk/nextjs", async () => {
    const require_ = createRequire(path.join(WEB_ROOT, "package.json"));
    const entry = require_.resolve("@clerk/nextjs");
    const types = path.join(path.dirname(entry), "..", "types", "index.d.ts");

    const declared = fs.existsSync(types)
      ? fs.readFileSync(types, "utf8")
      : Object.keys(await import("@clerk/nextjs")).join(" ");

    for (const name of ["ClerkLoading", "ClerkLoaded", "ClerkFailed"]) {
      expect(declared, `@clerk/nextjs no longer exports ${name}`).toContain(name);
    }
  });
});
