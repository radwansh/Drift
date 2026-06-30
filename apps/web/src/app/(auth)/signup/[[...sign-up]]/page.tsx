"use client";
import { SignUp } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { dark } from "@clerk/themes";

export default function SignUpPage() {
  const { theme } = useTheme();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="Drift" className="h-10 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Create your company account</p>
        </div>
        <SignUp appearance={{ baseTheme: theme === "dark" ? dark : undefined }} />
      </div>
    </div>
  );
}
