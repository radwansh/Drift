import { defineConfig, devices } from "@playwright/test";

/**
 * The first Playwright config in this repo. `@playwright/test` has been a
 * devDependency and `test:e2e` a script since before the Ink & Signal rebuild,
 * but neither a config nor a spec ever landed, so the script failed on a
 * missing config and nothing ran.
 *
 * It exists now for one check that cannot be made any other way: **Google
 * renders JavaScript.** A middleware test proves no redirect comes back from
 * the server; it cannot prove that Clerk's browser script, which still loads
 * on the marketing pages, does not navigate the page to a handshake once it
 * runs. That needs a real browser with an empty cookie jar.
 *
 * Not in CI. These specs need browser binaries (`pnpm exec playwright install
 * chromium`) and a running deployment, and `ci.yml` runs lint, typecheck, test
 * and build only. Point it at a preview or at production:
 *
 *     PLAYWRIGHT_BASE_URL=https://www.clarivo-app.com pnpm --filter @saas/web test:e2e
 *
 * With no `PLAYWRIGHT_BASE_URL` it starts `next dev` and tests that, which
 * needs a Clerk publishable key in `apps/web/.env.local` — the root layout
 * wraps everything in `ClerkProvider` and throws without one.
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const isLocal = ["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname);

/**
 * Vercel's Deployment Protection covers every preview URL, so a preview run
 * needs the bypass secret or every page answers 401.
 */
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    /**
     * No `storageState`. Every context starts with an empty cookie jar, which
     * is the condition that produced the loop — a signed-in browser carried
     * Clerk's session cookie and skipped the handshake entirely, which is why
     * the site looked healthy to everyone who checked it.
     */
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : {},
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(isLocal
    ? {
        webServer: {
          command: "pnpm dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
