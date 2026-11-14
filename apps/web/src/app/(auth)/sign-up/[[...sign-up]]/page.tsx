"use client";
import { SignUp } from "@clerk/nextjs";
import { AuthFrame } from "@/components/shared/auth-frame";
import { useIsDark } from "@/components/shared/theme-toggle";
import { getClerkAppearance } from "@/lib/clerk-appearance";

/**
 * /sign-up — Clerk's prebuilt screen, framed and themed to Ink & Signal. While
 * `launch.waitlistMode` is on the landing page sends visitors to /waitlist instead,
 * so this route is reached only by an approved invitation from the waiting list, or
 * directly.
 *
 * Step 7 of the rename plan replaces this with the custom Registration Form
 * from the sign-up diagram; until then Clerk's own screen handles the bot
 * check and the email code. /signup redirects here in middleware.
 */
export default function SignUpPage() {
  const isDark = useIsDark();
  return (
    <AuthFrame
      title="Create your company account"
      lede="Upload two payroll periods and Clarivo shows every change between them: who, which component, and by how much."
    >
      <SignUp appearance={getClerkAppearance(isDark)} />
    </AuthFrame>
  );
}
