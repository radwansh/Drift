"use client";
import { SignIn } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { dark } from "@clerk/themes";

/**
 * /sign-in — Clerk's prebuilt screen.
 *
 * The canonical sign-in path from here on. /login redirects to it in
 * middleware, so existing links and bookmarks keep working.
 */
export default function SignInPage() {
  const { theme } = useTheme();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <img src="/brand/clarivo-lockup.svg" alt="Clarivo" className="mx-auto mb-4 h-10" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Payroll variance analysis for your business
          </p>
        </div>
        <SignIn appearance={{ baseTheme: theme === "dark" ? dark : undefined }} />
      </div>
    </div>
  );
}
