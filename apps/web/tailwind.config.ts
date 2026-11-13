import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Clarivo design-system tokens (Ink & Signal), mapped for Tailwind v3.
 *
 * Two vocabularies, one palette:
 *
 * - `cv-*` utilities (`bg-cv-surface`, `text-cv-ink-muted`, `rounded-cv-lg`...) read the
 *   complete colour values in src/app/clarivo-tokens.css. New code uses these.
 * - shadcn/ui's semantic names (`bg-card`, `text-muted-foreground`, `border-input`...)
 *   still work: globals.css maps their HSL variables onto the same tokens, so the
 *   components under components/ui and every existing class repaint without edits.
 *
 * Opacity modifiers like `bg-cv-ink/50` do not work on cv- colours — a full colour has
 * no channels to modify. Use the `-soft` tokens, or `bg-cv-scrim` for overlays.
 *
 * The overrides below also make Tailwind's defaults speak the design system: `font-sans`
 * is Instrument Sans, `font-mono` is Geist Mono, `rounded-sm|md|lg|xl` are the DS radii,
 * `shadow-sm|md|lg` are the DS shadows, and transitions default to 120ms ease-out.
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
      scrim: "var(--cv-scrim)",
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
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: { DEFAULT: "hsl(var(--sidebar))", foreground: "hsl(var(--sidebar-foreground))" },
        // Were hardcoded #16a34a / #d97706. Status colours now come from the system.
        success: {
          DEFAULT: "var(--cv-success)",
          foreground: "var(--cv-on-primary)",
          ink: "var(--cv-success-ink)",
          soft: "var(--cv-success-soft)",
        },
        warning: {
          DEFAULT: "var(--cv-warning)",
          foreground: "var(--cv-on-warning)",
          ink: "var(--cv-warning-ink)",
          soft: "var(--cv-warning-soft)",
        },
        ...clarivoTokens.colors,
      },
      fontFamily: {
        sans: "var(--cv-font-sans)",
        mono: "var(--cv-font-mono)",
        ...clarivoTokens.fontFamily,
      },
      fontSize: {
        // The 12px floor is `caption`; nothing in the app goes smaller.
        caption: ["12px", { lineHeight: "16px", letterSpacing: "0.01em", fontWeight: "500" }],
        label: ["13px", { lineHeight: "18px", letterSpacing: "0.005em", fontWeight: "500" }],
        "body-sm": ["14px", { lineHeight: "20px" }],
        body: ["15px", { lineHeight: "24px" }],
        subheading: ["16px", { lineHeight: "24px", fontWeight: "600" }],
        heading: ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        title: ["28px", { lineHeight: "34px", letterSpacing: "-0.02em", fontWeight: "600" }],
        kpi: ["36px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "600" }],
        figure: ["13px", { lineHeight: "20px" }],
      },
      borderRadius: {
        // The design system's radii, under Tailwind's own names, so shadcn's
        // rounded-md (buttons, inputs) and rounded-lg (cards) land on them.
        sm: "var(--cv-radius-sm)",
        md: "var(--cv-radius-md)",
        lg: "var(--cv-radius-lg)",
        xl: "var(--cv-radius-xl)",
        ...clarivoTokens.borderRadius,
      },
      boxShadow: {
        // Borders first: cards carry no shadow. These are for the selected segment
        // (sm), menus and popovers (md) and dialogs (lg).
        DEFAULT: "var(--cv-shadow-sm)",
        sm: "var(--cv-shadow-sm)",
        md: "var(--cv-shadow-md)",
        lg: "var(--cv-shadow-lg)",
        xl: "var(--cv-shadow-lg)",
        ...clarivoTokens.boxShadow,
      },
      transitionDuration: { DEFAULT: "120ms", 200: "200ms" },
      transitionTimingFunction: { DEFAULT: "cubic-bezier(0, 0, 0.2, 1)" },
      // Content column: 1280px plus the page padding (space-10 a side on desktop).
      maxWidth: { content: "1360px" },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
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
