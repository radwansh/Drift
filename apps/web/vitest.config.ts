import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Each suite builds its own PGlite database; migrations take a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      // `server-only` has no runtime behaviour — it exists so that a build
      // fails when a server module reaches a client bundle — and it does not
      // resolve under vitest. Without this, any test importing a module that
      // transitively reaches `src/config/environment.ts` fails at collection,
      // before any assertion runs. `next build` still sees the real package.
      "server-only": path.resolve(import.meta.dirname, "./test/stubs/server-only.ts"),
      "@": path.resolve(import.meta.dirname, "./src"),
      "@saas/types": path.resolve(import.meta.dirname, "../../packages/types/src"),
      "@saas/db": path.resolve(import.meta.dirname, "../../packages/db/src"),
      "@saas/payroll-core": path.resolve(import.meta.dirname, "../../packages/payroll-core/src"),
      "@saas/ai": path.resolve(import.meta.dirname, "../../packages/ai/src"),
    },
  },
});
