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
);
