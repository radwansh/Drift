# Drift — Coming Soon Landing Page

A self-contained, static landing page for collecting early-access signups
before launch. No build step, no dependencies, no server required to host —
just static files.

## What's in this folder

| File                  | Purpose                                                       |
|-----------------------|----------------------------------------------------------------|
| `index.html`          | The landing page itself (HTML + CSS + JS, all inline)         |
| `favicon.ico`         | Legacy browser favicon                                         |
| `favicon.svg`         | Modern vector favicon (used by most current browsers)          |
| `favicon-16x16.png`   | Fallback PNG favicon                                            |
| `favicon-32x32.png`   | Fallback PNG favicon                                            |
| `apple-touch-icon.png`| Home-screen icon for iOS                                        |
| `icon-192.png`        | PWA / Android home-screen icon                                  |
| `icon-512.png`        | PWA / Android splash icon                                       |
| `site.webmanifest`    | Web app manifest (enables "Add to Home Screen")                 |
| `og-image.png`        | Social share preview image (1200×630, used by OG + Twitter tags)|
| `robots.txt`          | Tells search engines they can index the page                   |
| `sitemap.xml`         | Single-page sitemap                                             |

Everything is referenced with **absolute paths** (`/favicon.svg`,
`/og-image.png`, etc.), so this folder should be deployed as the **root** of
your domain — not a subfolder.

---

## 1. Before you deploy: update the domain

Several files reference `https://drift.so/` as a placeholder domain:

- `index.html` — `<link rel="canonical">`, Open Graph tags (`og:url`,
  `og:image`), Twitter card tags (`twitter:image`), and the footer email
  link (`hello@drift.so`)
- `robots.txt` — the `Sitemap:` line
- `sitemap.xml` — the `<loc>` entry

Find-and-replace `drift.so` with your real domain (and update the contact
email if needed) before going live. This matters most for the OG/Twitter
image tags — if they point to the wrong domain, link previews on social
media and chat apps won't render the preview image correctly.

---

## 2. Hosting options (pick one)

This is a static site, so any static host works. A few good free options:

### Vercel (recommended if you'll later build the full product on Next.js)
```bash
npm install -g vercel
cd drift-landing
vercel --prod
```
Then point your domain's DNS at Vercel from the project's Domains settings.

### Netlify
- Drag-and-drop this entire folder onto https://app.netlify.com/drop, **or**
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=.
```

### Cloudflare Pages
```bash
npm install -g wrangler
wrangler pages deploy . --project-name=drift-landing
```

### GitHub Pages
1. Push this folder to a GitHub repo (root of the repo, or a `/docs` folder).
2. In repo Settings → Pages, set the source to that branch/folder.
3. Add a `CNAME` file containing your domain if using a custom domain.

### Any traditional web host (shared hosting, S3 + CloudFront, etc.)
Just upload all files in this folder to the web root (e.g. `public_html/`,
or an S3 bucket configured for static website hosting).

---

## 3. Wiring up the email capture form

The form in `index.html` currently uses a **placeholder** `submitEmail()`
function (search for `async function submitEmail`) that simulates a network
call and always succeeds. You need to replace this with a real integration.
Three common options:

### Option A — Email marketing tool (fastest, no code)
Services like Mailchimp, ConvertKit, Beehiiv, or Loops all provide a form
endpoint you can POST to. Replace the body of `submitEmail` with:

```javascript
async function submitEmail(email) {
  const res = await fetch('https://YOUR-PROVIDER-ENDPOINT', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  if (!res.ok) throw new Error('Request failed');
  return { ok: true };
}
```

Check your provider's docs for the exact endpoint and payload shape — some
require `application/x-www-form-urlencoded` instead of JSON, and some need
an API key (which should NOT be embedded in client-side code — use a
serverless function as a proxy in that case, see Option B).

### Option B — Your own serverless function
If you're deploying on Vercel, Netlify, or Cloudflare Pages, you can add a
small serverless function (e.g. `/api/waitlist`) that writes the email to a
database (Postgres, Airtable, Google Sheets via API, etc.) and keeps any API
keys server-side. Point `submitEmail` at that endpoint:

```javascript
async function submitEmail(email) {
  const res = await fetch('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  if (!res.ok) throw new Error('Request failed');
  return { ok: true };
}
```

This is the natural option if you're already planning the Drift backend in
TypeScript — the same serverless function pattern carries forward into the
full product.

### Option C — Formspree / Basin / similar form backends
Drop-in form endpoints that email you (or forward to a spreadsheet) on
submission, with zero backend code. Replace `submitEmail` with a POST to
the endpoint they give you.

---

## 4. Updating the page after launch

The HTML includes a content slot near the bottom of `<main>`:

```html
<section class="section wrap content-slot" id="post-launch" aria-hidden="true">
  <!-- Replace with launch content -->
</section>
```

When Drift is live:
1. Remove the `content-slot` class (and the matching `display:none` rule in
   the `<style>` block) to unhide this section, or repurpose it.
2. Fill it with real launch content — pricing, a live demo, a sign-up CTA,
   etc. — using the same design tokens (`--ink`, `--drift`, `--on-baseline`,
   `--paper`, etc.) and type scale already defined at the top of the
   stylesheet, so the page stays visually consistent.
3. Update the "In progress" / "Planned" tags in the "What's coming" section
   to "Live" as features ship, or remove that section entirely once it's
   no longer needed.
4. Update `<meta name="description">`, the Open Graph tags, and
   `og-image.png` if the headline message changes.

---

## 5. Local preview

No build step needed — just serve the folder with any static file server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or

```bash
npx serve .
```
