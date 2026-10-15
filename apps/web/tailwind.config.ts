import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Clarivo design-system tokens, mapped for Tailwind v3.
 *
 * Copied from docs/landing/design-system/tailwind/clarivo.tailwind-v3.cjs
 * (the hand-off ships a v3 and a v4 file; this project is on tailwindcss
 * ^3.4.0 with a config file, so v3 is the one that applies). The values are
 * `var(--cv-*)` references resolved by src/app/clarivo-tokens.css.
 *
 * Every name carries a `cv` prefix, which is what keeps it clear of
 * shadcn/ui's `--primary`, `--accent`, `--border` and `--radius`: those are
 * HSL channel triplets consumed as `hsl(var(--x))`, while these are complete
 * colour values. Mixing the two forms in one key would break both.
 *
 * Opacity modifiers like `bg-cv-ink/50` do not work for the same reason — a
 * full colour has no channels to modify. Use the `-soft` tokens instead.
 */
const clarivoTokens = {
  colors: {
    cv: {
      bg: "var(--cv-bg)",
      surface: "var(--cv-surface)",
      "surface-sunken": "var(--cv-surface-sunken)",
      "surface-raised": "var(--cv-surface-raised)",
      "surface-inverse": "var(--cv-surface-inverse)",
      line: "var(--cv-line)",
      border: "var(--cv-border)",
      ink: "var(--cv-ink)",
      "ink-muted": "var(--cv-ink-muted)",
      "ink-subtle": "var(--cv-ink-subtle)",
      "ink-disabled": "var(--cv-ink-disabled)",
      "ink-inverse": "var(--cv-ink-inverse)",
      primary: "var(--cv-primary)",
      "primary-hover": "var(--cv-primary-hover)",
      "on-primary": "var(--cv-on-primary)",
      accent: "var(--cv-accent)",
      "accent-hover": "var(--cv-accent-hover)",
      "accent-soft": "var(--cv-accent-soft)",
      "on-accent": "var(--cv-on-accent)",
      focus: "var(--cv-focus)",
      signal: "var(--cv-signal)",
      "signal-ink": "var(--cv-signal-ink)",
      "signal-soft": "var(--cv-signal-soft)",
      "on-signal": "var(--cv-on-signal)",
      "delta-up": "var(--cv-delta-up)",
      "delta-up-ink": "var(--cv-delta-up-ink)",
      "delta-down": "var(--cv-delta-down)",
      "delta-down-ink": "var(--cv-delta-down-ink)",
      "delta-flat": "var(--cv-delta-flat)",
      "delta-flat-ink": "var(--cv-delta-flat-ink)",
      "chart-previous": "var(--cv-chart-previous)",
      "chart-current": "var(--cv-chart-current)",
      "chart-1": "var(--cv-chart-1)",
      "chart-2": "var(--cv-chart-2)",
      "chart-3": "var(--cv-chart-3)",
      "chart-4": "var(--cv-chart-4)",
      "chart-5": "var(--cv-chart-5)",
      "chart-6": "var(--cv-chart-6)",
      "chart-grid": "var(--cv-chart-grid)",
      "chart-axis": "var(--cv-chart-axis)",
      success: "var(--cv-success)",
      "success-ink": "var(--cv-success-ink)",
      "success-soft": "var(--cv-success-soft)",
      warning: "var(--cv-warning)",
      "warning-ink": "var(--cv-warning-ink)",
      "warning-soft": "var(--cv-warning-soft)",
      "on-warning": "var(--cv-on-warning)",
      danger: "var(--cv-danger)",
      "danger-hover": "var(--cv-danger-hover)",
      "danger-ink": "var(--cv-danger-ink)",
      "danger-soft": "var(--cv-danger-soft)",
      "on-danger": "var(--cv-on-danger)",
      "slate-25": "var(--cv-slate-25)",
      "slate-50": "var(--cv-slate-50)",
      "slate-100": "var(--cv-slate-100)",
      "slate-200": "var(--cv-slate-200)",
      "slate-300": "var(--cv-slate-300)",
      "slate-400": "var(--cv-slate-400)",
      "slate-500": "var(--cv-slate-500)",
      "slate-600": "var(--cv-slate-600)",
      "slate-700": "var(--cv-slate-700)",
      "slate-800": "var(--cv-slate-800)",
      "slate-900": "var(--cv-slate-900)",
      "slate-950": "var(--cv-slate-950)",
      "rust-50": "var(--cv-rust-50)",
      "rust-100": "var(--cv-rust-100)",
      "rust-200": "var(--cv-rust-200)",
      "rust-300": "var(--cv-rust-300)",
      "rust-400": "var(--cv-rust-400)",
      "rust-500": "var(--cv-rust-500)",
      "rust-600": "var(--cv-rust-600)",
      "rust-700": "var(--cv-rust-700)",
      "rust-800": "var(--cv-rust-800)",
      "rust-900": "var(--cv-rust-900)",
      "cobalt-50": "var(--cv-cobalt-50)",
      "cobalt-100": "var(--cv-cobalt-100)",
      "cobalt-200": "var(--cv-cobalt-200)",
      "cobalt-300": "var(--cv-cobalt-300)",
      "cobalt-400": "var(--cv-cobalt-400)",
      "cobalt-500": "var(--cv-cobalt-500)",
      "cobalt-600": "var(--cv-cobalt-600)",
      "cobalt-700": "var(--cv-cobalt-700)",
      "cobalt-800": "var(--cv-cobalt-800)",
      "cobalt-900": "var(--cv-cobalt-900)",
    },
  },
  fontFamily: { "cv-sans": "var(--cv-font-sans)", "cv-mono": "var(--cv-font-mono)" },
  borderRadius: {
    "cv-xs": "var(--cv-radius-xs)",
    "cv-sm": "var(--cv-radius-sm)",
    "cv-md": "var(--cv-radius-md)",
    "cv-lg": "var(--cv-radius-lg)",
    "cv-xl": "var(--cv-radius-xl)",
    "cv-full": "var(--cv-radius-full)",
  },
  boxShadow: {
    "cv-sm": "var(--cv-shadow-sm)",
    "cv-md": "var(--cv-shadow-md)",
    "cv-lg": "var(--cv-shadow-lg)",
    "cv-focus-ring": "var(--cv-focus-ring)",
  },
} as const;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: { DEFAULT: "hsl(var(--sidebar))", foreground: "hsl(var(--sidebar-foreground))" },
        success: { DEFAULT: "#16a34a", foreground: "#ffffff" },
        warning: { DEFAULT: "#d97706", foreground: "#ffffff" },
        ...clarivoTokens.colors,
      },
      fontFamily: clarivoTokens.fontFamily,
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        ...clarivoTokens.borderRadius,
      },
      boxShadow: clarivoTokens.boxShadow,
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
