import { test, expect } from "@playwright/test";

/**
 * **A rendered marketing page stays where it is.**
 *
 * `test/marketing-crawlable.test.ts` proves the server returns no redirect.
 * This proves the *browser* does not produce one, which is a different claim
 * and the one Googlebot actually experiences: Google renders JavaScript, and
 * Clerk's script still loads on these pages — `ClerkProvider` wraps the whole
 * app and the marketing header's `<SignedIn>` / `<SignedOut>` gate runs
 * client-side. A client-side redirect to a handshake would be invisible to
 * every server-side check in this repository.
 *
 * Two pages, chosen because they are the two Search Console named: the home
 * page and the post that earns the links.
 */

const PATHS = ["/", "/blog/payroll-variance-report-what-to-check"];

/** Googlebot smartphone, the agent that crawls this site. */
const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.6778.264 Mobile Safari/537.36 " +
  "(compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const isClerkHost = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return hostname.startsWith("clerk.") || hostname.endsWith(".clerk.accounts.dev");
  } catch {
    return false;
  }
};

for (const path of PATHS) {
  test(`${path} renders and stays put with no cookies`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ userAgent: GOOGLEBOT });

    // The empty jar is the premise, so it is asserted rather than assumed.
    expect(await context.cookies()).toEqual([]);

    const page = await context.newPage();

    /**
     * Top-level navigations only.
     *
     * Clerk's `clerk.browser.js` is *expected* to be requested from
     * `clerk.clarivo-app.com` — that is a subresource and entirely fine. What
     * must not happen is the page itself navigating there. Watching
     * `framenavigated` on the main frame is what separates the two; watching
     * requests would fail on a healthy page.
     */
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    const target = new URL(path, baseURL).toString();
    const response = await page.goto(target, { waitUntil: "load" });

    expect(response?.status()).toBe(200);

    // Clerk loads, initialises and decides there is no session in this window.
    await page.waitForTimeout(5_000);

    expect(page.url()).toBe(target);
    expect(navigations.filter(isClerkHost)).toEqual([]);

    // The page rendered, rather than returning a shell that then redirected.
    await expect(page.locator("h1").first()).toBeVisible();

    await context.close();
  });
}
