import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15 is still an eslintrc-style shareable config (it exports
// `{ extends: [...] }`), so FlatCompat bridges it into flat config. The version is
// pinned to the Next major in use: eslint-config-next 16 ships
// eslint-plugin-react-hooks v6, whose React-Compiler rules flag long-standing
// patterns across this app and are a separate piece of work.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // The root tsconfig turns noUnusedLocals/noUnusedParameters off, so these
      // stay warnings rather than becoming a wall of errors.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Config files run in Node and legitimately use CommonJS interop.
    files: ["*.config.{ts,mjs,js}", "postcss.config.{js,mjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    /**
     * `scripts/` is plain Node ESM, not TypeScript.
     *
     * `tseslint.configs.recommended` above applies the TypeScript parser to
     * every file it is given, and on a `.mjs` file its scope analysis reports
     * every top-level binding as "assigned a value but only used as a type" —
     * 63 false positives for one 300-line script, which is enough noise to
     * bury a real warning. The base `no-unused-vars` is correct on this file,
     * so the script is still linted for the thing that matters; it is the
     * TypeScript-aware version of the rule that cannot read it.
     */
    files: ["scripts/**/*.{mjs,js}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
