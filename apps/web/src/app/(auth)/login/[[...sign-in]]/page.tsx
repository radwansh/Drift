"use client";
import { SignIn } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { dark } from "@clerk/themes";

export default function LoginPage() {
  const { theme } = useTheme();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Drift</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Payroll variance analysis for your business</p>
        </div>
        <SignIn appearance={{ baseTheme: theme === "dark" ? dark : undefined }} />
      </div>
    </div>
  );
}
