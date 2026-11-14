import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";
import { dark as clerkDark } from "@clerk/themes";

/**
 * Clerk's prebuilt screens and the account menu, themed to Ink & Signal
 * (redesign canvas: "Sign in (Clerk, themed)").
 *
 * Clerk derives hover and border shades from `variables` with its own colour maths, so
 * these are literal hex values from the design system rather than var(--cv-*); the
 * pair below mirrors the Light and Dark token sets. `fontFamily` can read the CSS
 * variable because it is passed through untouched.
 *
 * - Primary action in Ink (paper in dark), never cobalt or rust: in the app, actions
 *   are the `primary` button.
 * - Cards outlined in `line` with no shadow, radius 6px for controls (radius-md).
 *
 * Use `useIsDark()` from components/shared/theme-toggle to pick the pair in a client
 * component: <SignIn appearance={getClerkAppearance(isDark)} />.
 */

export type ClerkAppearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

const FONT = 'var(--font-instrument-sans), "Instrument Sans", ui-sans-serif, system-ui, sans-serif';

const LIGHT = {
  colors: {
    colorPrimary: "#121a22",
    colorTextOnPrimaryBackground: "#ffffff",
    colorText: "#121a22",
    colorTextSecondary: "#4e5862",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#121a22",
    colorNeutral: "#121a22",
    colorDanger: "#b01f4f",
    colorSuccess: "#187c49",
    colorWarning: "#8d5e00",
  },
  line: "#e6eaed",
  border: "#7f8790",
  menuShadow: "0 2px 4px #121a2210, 0 8px 20px -4px #121a2224",
};

const DARK = {
  colors: {
    colorPrimary: "#f3f5f7",
    colorTextOnPrimaryBackground: "#121a22",
    colorText: "#eceff2",
    colorTextSecondary: "#b7bfc7",
    colorBackground: "#121a22",
    colorInputBackground: "#121a22",
    colorInputText: "#eceff2",
    colorNeutral: "#eceff2",
    colorDanger: "#ef7cac",
    colorSuccess: "#5ec386",
    colorWarning: "#f2af48",
  },
  line: "#282f36",
  border: "#687078",
  menuShadow: "0 8px 24px -4px #000000b3",
};

export function getClerkAppearance(isDark: boolean): ClerkAppearance {
  const t = isDark ? DARK : LIGHT;
  return {
    baseTheme: isDark ? clerkDark : undefined,
    variables: {
      ...t.colors,
      fontFamily: FONT,
      fontFamilyButtons: FONT,
      borderRadius: "6px",
      fontSize: "15px",
    },
    elements: {
      card: { boxShadow: "none", border: `1px solid ${t.line}` },
      formButtonPrimary: { textTransform: "none", fontWeight: 600, boxShadow: "none" },
      socialButtonsBlockButton: { border: `1px solid ${t.border}`, boxShadow: "none" },
      formFieldInput: { borderColor: t.border, boxShadow: "none" },
      userButtonPopoverCard: { boxShadow: t.menuShadow, border: `1px solid ${t.line}` },
    },
  };
}
