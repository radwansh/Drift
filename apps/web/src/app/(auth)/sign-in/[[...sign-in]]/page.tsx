"use client";
import { SignIn } from "@clerk/nextjs";
import { AuthFrame } from "@/components/shared/auth-frame";
import { useIsDark } from "@/components/shared/theme-toggle";
import { getClerkAppearance } from "@/lib/clerk-appearance";

/**
 * /sign-in — Clerk's prebuilt screen, framed and themed to Ink & Signal.
 *
 * The canonical sign-in path from here on. /login redirects to it in
 * middleware, so existing links and bookmarks keep working.
 */
export default function SignInPage() {
  const isDark = useIsDark();
  return (
    <AuthFrame
      title="See what changed in your payroll, by how much, and where."
      lede="Compare two payroll periods and every change in net pay and salary components is in one place, with the employee and the amount."
    >
      <SignIn appearance={getClerkAppearance(isDark)} />
    </AuthFrame>
  );
}
