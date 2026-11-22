#!/usr/bin/env node
/**
 * Is this deployment crawlable?
 *
 * Run it after any deploy that touches routing, middleware, Clerk or the
 * sitemap:
 *
 *     pnpm --filter @saas/web check:crawl https://www.clarivo-app.com
 *     pnpm --filter @saas/web check:crawl https://<deployment>.vercel.app --preview
 *
 * **Why it exists.** clarivo-app.com fell out of Google's index and every
 * check anyone made by hand said it was fine. Production ran on a Clerk
 * development instance, so a request with no Clerk cookies was redirected to
 * the handshake endpoint on `accounts.dev` — which answered
 * `X-Robots-Tag: noindex, nofollow` and redirected back with a
 * ~1,800-character token in the URL. Googlebot keeps no cookies and was still
 * being redirected after 20 hops; a browser gives up after 3 and retries
 * clean, which is why it looked healthy. Search Console reported it weeks
 * later, first as "Excluded by 'noindex' tag" and then as "Redirect error".
 *
 * So this asks the question the way a crawler does — Googlebot smartphone,
 * `Accept: text/html`, no cookies, `redirect: "manual"` — and fails loudly.
 * Node's `fetch` keeps no cookie jar, which is the condition that matters: it
 * is a cookieless client by construction, not by configuration.
 *
 * Plain Node, no dependencies, so it runs anywhere `node` does.
 */

const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.6778.264 Mobile Safari/537.36 " +
  "(compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const TIMEOUT_MS = 20_000;

/* ------------------------------------------------------------------ args -- */

const args = process.argv.slice(2);
const preview = args.includes("--preview");
const base = args.find((a) => !a.startsWith("--"));

if (!base) {
  console.error("usage: node scripts/check-crawlable.mjs <base-url> [--preview]");
  console.error("   eg: node scripts/check-crawlable.mjs https://www.clarivo-app.com");
  process.exit(2);
}

const origin = new URL(base).origin;

/**
 * Vercel's Deployment Protection covers everything except custom domains, so a
 * preview URL answers 401 to an anonymous request. The bypass secret is the
 * documented way through for automation; without it a preview run cannot say
 * anything, so the script reports that rather than pretending to pass.
 */
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

const headers = {
  "user-agent": GOOGLEBOT,
  accept: "text/html,application/xhtml+xml",
  ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
};

/* ------------------------------------------------------------------ util -- */

const get = (url, extra = {}) =>
  fetch(url, {
    redirect: "manual",
    headers: { ...headers, ...extra },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

/** Every `X-Robots-Tag` value on the response, lowercased, one per directive. */
const robotsDirectives = (res) =>
  (res.headers.get("x-robots-tag") ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

const metaRobots = (html) => {
  const m = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i);
  return m ? m[1].trim().toLowerCase() : null;
};

const canonicalOf = (html) => {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  return m ? m[1].trim() : null;
};

/**
 * Which Clerk instance the page carries.
 *
 * A publishable key is `pk_live_`/`pk_test_` plus base64 of
 * `<frontend-api-host>$`, so the host comes out of the key itself — no need to
 * guess from script URLs. `pk_test_` here is the whole original failure.
 */
const clerkInstanceOf = (html) => {
  const m = html.match(/pk_(live|test)_([A-Za-z0-9+/=_-]{8,})/);
  if (!m) return null;

  let host = null;
  try {
    const decoded = Buffer.from(m[2], "base64").toString("utf8");
    if (/^[\w.-]+\$?$/.test(decoded)) host = decoded.replace(/\$$/, "");
  } catch {
    /* a key that does not decode is still worth reporting by its prefix */
  }
  return { kind: m[1], host };
};

const pad = (s, n) => String(s).padEnd(n);

/* ------------------------------------------------------------- robots.txt -- */

const failures = [];
const fail = (where, why) => failures.push(`${where}: ${why}`);

console.log(`Crawl check: ${origin}`);
console.log(`  mode:   ${preview ? "preview" : "production"}`);
console.log(`  bypass: ${bypass ? "x-vercel-protection-bypass sent" : "not set"}`);
console.log("");

let disallowed = [];

try {
  const res = await get(`${origin}/robots.txt`);
  const body = res.ok ? await res.text() : "";
  const sitemapLine = body.match(/^\s*Sitemap:\s*(\S+)/im);

  console.log(`robots.txt   ${res.status}  ${sitemapLine ? sitemapLine[1] : "(no Sitemap: line)"}`);

  if (res.status !== 200) fail("/robots.txt", `status ${res.status}`);
  if (res.status === 200 && !sitemapLine) fail("/robots.txt", "no Sitemap: line");

  disallowed = [...body.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((m) => m[1]);
} catch (e) {
  console.log("robots.txt   ERROR");
  fail("/robots.txt", e.message);
}

/* ------------------------------------------------------------ sitemap.xml -- */

/** The `<loc>` values, which are production URLs even on a preview build. */
let locs = [];

try {
  const res = await get(`${origin}/sitemap.xml`, { accept: "application/xml,text/xml" });
  const body = res.ok ? await res.text() : "";
  locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

  console.log(`sitemap.xml  ${res.status}  ${locs.length} urls`);

  if (res.status !== 200) fail("/sitemap.xml", `status ${res.status}`);
  if (res.status === 200 && locs.length === 0) fail("/sitemap.xml", "no <loc> entries");
} catch (e) {
  console.log("sitemap.xml  ERROR");
  fail("/sitemap.xml", e.message);
}

/* ----------------------------------------------------------- every <loc> -- */

console.log("");
console.log(
  `     ${pad("PATH", 46)} ${pad("STATUS", 7)}${pad("LOCATION", 10)}` +
    `${pad("X-ROBOTS-TAG", 16)}${pad("META", 10)}${pad("CANONICAL", 11)}CLERK`,
);

const clerkSeen = new Set();
const authReasonSeen = [];

for (const loc of locs) {
  const path = new URL(loc).pathname;
  const url = `${origin}${path}`;
  const problems = [];

  let status = "—";
  let location = "—";
  let xrobots = "—";
  let meta = "—";
  let canon = "—";
  let clerk = "—";

  try {
    const res = await get(url);
    status = res.status;

    /**
     * A `Location` on a 200 would be odd but harmless; on anything else it is
     * the redirect that Google gave up following. Both are failures here,
     * because a sitemap must list final addresses.
     */
    const loca = res.headers.get("location");
    if (loca) {
      location = loca.length > 9 ? loca.slice(0, 8) + "…" : loca;
      problems.push(`Location: ${loca}`);
    }
    if (res.status !== 200) problems.push(`status ${res.status}`);

    const directives = robotsDirectives(res);
    xrobots = directives.length ? directives.join(", ") : "(none)";
    if (xrobots.length > 15) xrobots = xrobots.slice(0, 14) + "…";

    const hasIndexFollow = directives.includes("index") && directives.includes("follow");
    if (!hasIndexFollow) {
      problems.push("no X-Robots-Tag: index, follow");
    }

    /**
     * On a preview, Vercel adds its own `noindex` and that is correct — a
     * preview must not be indexed. Everywhere else a `noindex` is the bug this
     * script exists for.
     */
    const headerNoindex = directives.some((d) => d.includes("noindex"));
    if (headerNoindex && !preview) problems.push("noindex in X-Robots-Tag");

    const html = res.status === 200 ? await res.text() : "";

    const mr = metaRobots(html);
    if (mr) meta = mr.length > 9 ? mr.slice(0, 8) + "…" : mr;
    if (mr && mr.includes("noindex") && !preview) {
      problems.push(`noindex in <meta name="robots"> (${mr})`);
    }

    /**
     * The canonical must be the page's own URL — and `<loc>` *is* that URL:
     * both come from `SITE.url`, so on production they are the same string. On
     * a preview the app still emits production canonicals, which is right, so
     * the comparison is against `<loc>` in both modes rather than against the
     * deployment URL being fetched.
     */
    const c = canonicalOf(html);
    if (!c) {
      canon = "(none)";
      if (res.status === 200) problems.push("no <link rel=canonical>");
    } else if (c === loc) {
      canon = "ok";
    } else {
      canon = "WRONG";
      problems.push(`canonical ${c} is not ${loc}`);
    }

    const instance = clerkInstanceOf(html);
    if (instance) {
      clerk = `pk_${instance.kind}_`;
      clerkSeen.add(`pk_${instance.kind}_ -> ${instance.host ?? "(host undecodable)"}`);
    }

    /**
     * Reported, not failed. A marketing page that still carries
     * `x-clerk-auth-reason` went through `clerkMiddleware`, which is what the
     * bypass in `src/middleware.ts` removes — so this line is how you tell
     * whether that bypass is live, without it being a pass/fail condition the
     * spec did not ask for.
     */
    const reason = res.headers.get("x-clerk-auth-reason");
    if (reason) authReasonSeen.push(`${path} (${reason})`);
  } catch (e) {
    status = "ERR";
    problems.push(e.message);
  }

  const blockedBy = disallowed.filter(
    (rule) => rule !== "/" && path.startsWith(rule.replace(/\*$/, "")),
  );
  if (blockedBy.length) problems.push(`Disallow: ${blockedBy.join(" ")} in robots.txt`);

  console.log(
    ` ${problems.length ? "FAIL" : " ok "} ${pad(path, 46)} ${pad(status, 7)}` +
      `${pad(location, 10)}${pad(xrobots, 16)}${pad(meta, 10)}${pad(canon, 11)}${clerk}`,
  );

  for (const p of problems) fail(path, p);
}

/* -------------------------------------------------------- host variants -- */

/**
 * Skipped on a preview: a `*.vercel.app` deployment has no apex or `www`
 * variant to redirect, so the check would be meaningless rather than lenient.
 */
if (!preview) {
  const apex = new URL(base).hostname.replace(/^www\./, "");
  const expected = `https://www.${apex}/`;
  const variants = [`https://${apex}/`, `http://${apex}/`, `http://www.${apex}/`];

  console.log("");
  console.log(`host variants, expecting ${expected} in at most 2 hops`);

  for (const start of variants) {
    const chain = [];
    let url = start;
    let hops = 0;

    try {
      while (hops <= 3) {
        const res = await get(url);
        const next = res.headers.get("location");
        chain.push(`${res.status}`);
        if (!next) break;
        url = new URL(next, url).toString();
        hops += 1;
      }
    } catch (e) {
      fail(start, e.message);
      console.log(` FAIL ${pad(start, 34)} ${e.message}`);
      continue;
    }

    const ok = url === expected && hops <= 2;
    if (!ok) {
      fail(
        start,
        url === expected
          ? `reached ${expected} in ${hops} hops, want at most 2`
          : `landed on ${url}, want ${expected}`,
      );
    }
    console.log(
      ` ${ok ? " ok " : "FAIL"} ${pad(start, 34)} ${hops} hop${hops === 1 ? "" : "s"}` +
        ` [${chain.join(" -> ")}] -> ${url}`,
    );
  }
}

/* -------------------------------------------------------------- verdict -- */

console.log("");
console.log(
  `Clerk instance: ${clerkSeen.size ? [...clerkSeen].join("; ") : "none found in page HTML"}`,
);
console.log(
  `x-clerk-auth-reason on marketing pages: ${
    authReasonSeen.length ? authReasonSeen.join(", ") : "none"
  }`,
);

if (preview && !bypass) {
  console.log("");
  console.log(
    "NOTE: --preview without VERCEL_AUTOMATION_BYPASS_SECRET. Vercel's Deployment " +
      "Protection covers every preview URL, so a 302 to vercel.com/sso-api above " +
      "(or a 401) is the protection, not the app. Set the secret and run it again; " +
      "without it this run says nothing about the deployment.",
  );
}

console.log("");
if (failures.length === 0) {
  console.log(`PASS — ${locs.length} sitemap urls, no redirects, no noindex.`);
  process.exit(0);
}

console.log(`FAIL — ${failures.length} problem${failures.length === 1 ? "" : "s"}:`);
for (const f of failures) console.log(`  ${f}`);
process.exit(1);
