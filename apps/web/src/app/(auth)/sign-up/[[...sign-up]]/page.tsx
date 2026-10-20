"use client";
import { SignUp } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { dark } from "@clerk/themes";

/**
 * /sign-up — Clerk's prebuilt screen. While `launch.waitlistMode` is on the
 * landing page sends visitors to /waitlist instead, so this route is reached
 * only by an approved invitation from the waiting list, or directly.
 *
 * Step 7 of the rename plan replaces this with the custom Registration Form
 * from the sign-up diagram; until then Clerk's own screen handles the bot
 * check and the email code. /signup redirects here in middleware.
 */
export default function SignUpPage() {
  const { theme } = useTheme();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <img src="/brand/clarivo-lockup.svg" alt="Clarivo" className="mx-auto mb-4 h-10" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Create your company account</p>
        </div>
        <SignUp appearance={{ baseTheme: theme === "dark" ? dark : undefined }} />
      </div>
    </div>
  );
}
