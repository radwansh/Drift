import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifying a Polar webhook delivery, by the Standard Webhooks specification.
 *
 * Implemented here rather than taken from `@polar-sh/sdk` on purpose. The SDK's
 * `webhooks.validateEvent` does exactly this, but it would be the first runtime
 * dependency added for billing, it pulls a typed model of Polar's whole API in
 * behind it, and the four `packages/*` are consumed as raw TypeScript with no
 * build step — a lockfile change for forty lines of HMAC is a poor trade. The
 * algorithm is a published specification rather than a vendor detail, and it is
 * pinned by `test/polar-webhook.test.ts` against vectors computed by hand.
 *
 * The scheme, from the specification:
 *
 * 1. Three headers travel with the delivery: `webhook-id`, `webhook-timestamp`
 *    (Unix seconds) and `webhook-signature`. A delivery missing any of them is
 *    rejected outright.
 * 2. The signed content is `{id}.{timestamp}.{body}`, where `body` is the raw
 *    request text. It must never be parsed and re-serialised first — key order
 *    and whitespace both move, and the signature stops matching.
 * 3. The signature is the base64 of HMAC-SHA256 over that content.
 * 4. `webhook-signature` is a space-delimited list of `version,signature`
 *    entries, so that a secret can be rotated with two valid signatures in
 *    flight. `v1` is HMAC-SHA256. **Any** entry matching is a pass.
 * 5. The timestamp is checked against a tolerance, which is what makes a
 *    captured-and-replayed delivery stop working.
 *
 * **Two key derivations, because Polar changed scheme mid-flight.** Secrets
 * issued from 8 September 2026 are Standard Webhooks proper: the secret is
 * `whsec_` followed by base64, and the HMAC key is those decoded bytes. Secrets
 * issued before that date use Polar's older scheme, where the key is the UTF-8
 * bytes of the entire `whsec_…` string, prefix included. Polar's own SDK tries
 * both; so does this, because which one a deployment holds depends on when
 * somebody clicked a button in a dashboard, and that is not knowable from here.
 */

/** Standard Webhooks' recommended replay window, applied either side of now. */
export const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

const SECRET_PREFIX = "whsec_";

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type VerificationFailure =
  | "not_configured"
  | "missing_headers"
  | "bad_timestamp"
  | "stale_timestamp"
  | "bad_signature";

export type VerificationResult = { ok: true } | { ok: false; reason: VerificationFailure };

/**
 * The HMAC keys to try, most likely first.
 *
 * A `whsec_`-prefixed secret yields two candidates: the decoded base64 (the
 * current scheme) and the raw string's bytes (the legacy one). A secret without
 * the prefix is only ever its own bytes — Polar always prefixes, so this is the
 * "somebody pasted it oddly" path rather than a documented shape.
 */
function candidateKeys(secret: string): Buffer[] {
  const keys: Buffer[] = [];
  if (secret.startsWith(SECRET_PREFIX)) {
    const encoded = secret.slice(SECRET_PREFIX.length);
    const decoded = Buffer.from(encoded, "base64");
    // A base64 decode never throws — it discards what it cannot read — so an
    // empty result is the only signal that the body of the secret was not
    // base64 at all, and an empty HMAC key must not be used.
    if (decoded.length > 0) keys.push(decoded);
  }
  keys.push(Buffer.from(secret, "utf8"));
  return keys;
}

/** `true` only if the two strings are byte-identical, compared in constant time. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // `timingSafeEqual` throws on a length mismatch, which would itself leak the
  // length. Comparing lengths first is what the specification's reference
  // implementations do: a signature of the wrong length cannot be correct.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The `v1` signatures in a `webhook-signature` header.
 *
 * Entries of any other version — `v1a` is ed25519, which Polar does not send —
 * are dropped rather than compared, so an asymmetric signature is never
 * mistaken for an HMAC one.
 */
function v1Signatures(header: string): string[] {
  const out: string[] = [];
  for (const entry of header.split(" ")) {
    const comma = entry.indexOf(",");
    if (comma === -1) continue;
    if (entry.slice(0, comma) !== "v1") continue;
    const value = entry.slice(comma + 1);
    if (value.length > 0) out.push(value);
  }
  return out;
}

/**
 * Whether `body` really came from Polar.
 *
 * `body` is the raw request text, exactly as received. `now` is injectable so
 * the replay window can be tested without waiting five minutes.
 */
export function verifyPolarWebhook(
  body: string,
  headers: WebhookHeaders,
  secret: string | null,
  now: Date = new Date(),
): VerificationResult {
  // No secret means the app cannot tell a real delivery from a forged one. It
  // refuses every delivery rather than trusting it: this is the one place where
  // "degrade, never break" must not become "accept anything".
  if (secret === null || secret.trim().length === 0) {
    return { ok: false, reason: "not_configured" };
  }

  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "bad_timestamp" };

  const drift = Math.abs(Math.floor(now.getTime() / 1000) - sent);
  // Both directions: a timestamp in the future is as much a forgery signal as
  // one long past, and clock skew is what the tolerance is for.
  if (drift > TIMESTAMP_TOLERANCE_SECONDS) return { ok: false, reason: "stale_timestamp" };

  const sentSignatures = v1Signatures(signature);
  if (sentSignatures.length === 0) return { ok: false, reason: "bad_signature" };

  const signedContent = `${id}.${timestamp}.${body}`;
  for (const key of candidateKeys(secret.trim())) {
    const expected = createHmac("sha256", key).update(signedContent, "utf8").digest("base64");
    for (const candidate of sentSignatures) {
      if (constantTimeEquals(expected, candidate)) return { ok: true };
    }
  }
  return { ok: false, reason: "bad_signature" };
}

/** Reads the three headers from a `Request`, so the route does not spell them out. */
export function readWebhookHeaders(req: Request): WebhookHeaders {
  return {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  };
}
