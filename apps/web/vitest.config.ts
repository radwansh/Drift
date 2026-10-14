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
      "@": path.resolve(import.meta.dirname, "./src"),
      "@saas/types": path.resolve(import.meta.dirname, "../../packages/types/src"),
      "@saas/db": path.resolve(import.meta.dirname, "../../packages/db/src"),
      "@saas/payroll-core": path.resolve(import.meta.dirname, "../../packages/payroll-core/src"),
      "@saas/ai": path.resolve(import.meta.dirname, "../../packages/ai/src"),
    },
  },
});
