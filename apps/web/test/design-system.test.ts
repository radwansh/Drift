import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guards for the Ink & Signal design system (docs/design/CLAUDE_CODE_BRIEF.md).
 *
 * Every file under src/ must be free of the colours the design system replaces — raw
 * Tailwind palette classes (text-green-600, bg-red-50...), hard-coded hex colours, shadcn
 * HSL strings used as a colour, and the legacy increase/decrease/anomaly utilities.
 *
 * This was a ratchet while the rebuild ran: a LEGACY_FILES set named the screens not
 * migrated yet, a second test failed on any entry that had come clean, and the list was
 * the to-do list at every commit. It emptied in phase 5 and is gone, so the rule the one
 * remaining test states is no longer "no new offenders" but "none anywhere" — and there is
 * no list to add a file to. A screen that needs a colour needs a cv- token by meaning.
 */

const WEB_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(WEB_ROOT, "src");

/**
 * Files allowed to hold literal colours for good. Clerk's appearance API computes shades
 * from concrete values, so it cannot take var(--cv-...): the hex there mirror the tokens.
 */
const EXEMPT = new Set<string>(["src/lib/clerk-appearance.ts"]);

const PALETTE =
  "(?:red|green|amber|yellow|blue|indigo|purple|emerald|orange|rose|sky|teal|gray|slate|zinc|neutral|stone|violet|pink|lime|cyan|fuchsia)";

const RULES: { name: string; pattern: RegExp; instead: string }[] = [
  {
    name: "raw Tailwind palette colour",
    pattern: new RegExp(
      `\\b(?:text|bg|border|border-[lrtbxy]|fill|stroke|ring|ring-offset|from|to|via|divide|outline|decoration|accent|caret|placeholder)-${PALETTE}-\\d{2,3}\\b`,
      "g",
    ),
    instead:
      "a cv- token by meaning: delta-up/down/flat for change, success/warning/danger for status",
  },
  {
    name: "hard-coded hex colour",
    pattern: /["'`]\s*#[0-9a-fA-F]{6}\b/g,
    instead: "CHART.* from lib/chart-palette.ts, or a cv- utility",
  },
  {
    name: "shadcn HSL string as a colour",
    pattern: /hsl\(var\(--/g,
    instead: "CHART.* from lib/chart-palette.ts (charts) or a cv- utility",
  },
  {
    name: "legacy colour utility",
    pattern:
      /\b(?:increase-text|decrease-text|unchanged-text|anomaly-(?:critical|warning|info))\b/g,
    instead: "<Variance>, <SeverityBadge> or <Notice> from components/cv",
  },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Comments are prose about colours ("was text-green-600"), not uses of them. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function legacyHits(file: string): string[] {
  const code = stripComments(fs.readFileSync(file, "utf8"));
  const hits: string[] = [];
  for (const rule of RULES) {
    const found = code.match(rule.pattern);
    if (found)
      hits.push(
        `${rule.name}: ${[...new Set(found)].slice(0, 4).join(", ")} (use ${rule.instead})`,
      );
  }
  return hits;
}

const files = sourceFiles(SRC).map((full) => ({
  full,
  rel: path.relative(WEB_ROOT, full).split(path.sep).join("/"),
}));

describe("design system: Ink & Signal", () => {
  it("no file under src/ uses a colour the design system replaces", () => {
    const offenders = files
      .filter(({ rel }) => !EXEMPT.has(rel))
      .map(({ full, rel }) => ({ rel, hits: legacyHits(full) }))
      .filter(({ hits }) => hits.length > 0)
      .map(({ rel, hits }) => `${rel}\n    ${hits.join("\n    ")}`);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every cv- colour Tailwind names is declared in clarivo-tokens.css", () => {
    const config = fs.readFileSync(path.join(WEB_ROOT, "tailwind.config.ts"), "utf8");
    const tokens = fs.readFileSync(path.join(SRC, "app/clarivo-tokens.css"), "utf8");
    const used = [...new Set([...config.matchAll(/var\((--cv-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    const missing = used.filter((name) => !tokens.includes(`${name}:`));
    expect(missing).toEqual([]);
  });

  it("the components/cv barrel is what the marketing pages import", () => {
    const shim = fs.readFileSync(path.join(SRC, "components/marketing/ui/index.ts"), "utf8");
    expect(shim).toContain('export * from "@/components/cv"');
  });
});
