import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting for the AI generation mutation (step 23, finding A3).
 *
 * Upstash was already configured in the environment but never used, so model
 * calls had no ceiling at all — and because `getInsights` was a query, React
 * Query refetched it on mount and on window focus, calling the model each time.
 *
 * Follows the same shape as `db` and the AI client: when the service is not
 * configured the feature degrades instead of breaking. Here that means the limit
 * is not enforced, which is the right trade for a self-hosted deployment without
 * Upstash — the mutation is still editor-only and no longer fires on focus.
 */

const url = process.env["UPSTASH_REDIS_REST_URL"];
const token = process.env["UPSTASH_REDIS_REST_TOKEN"];

export const isRateLimitConfigured = Boolean(url && token);

let limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (!isRateLimitConfigured) return null;
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url: url!, token: token! }),
      // 5 generations per company per hour, per the plan.
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "drift:annual-insights",
      analytics: false,
    });
  }
  return limiter;
}

export interface RateLimitResult {
  success: boolean;
  /** Remaining allowance in the window; null when not enforced. */
  remaining: number | null;
  /** When the window resets, as an epoch milliseconds value; null when not enforced. */
  reset: number | null;
  enforced: boolean;
}

export async function limitInsightGeneration(companyId: string): Promise<RateLimitResult> {
  const rl = getLimiter();
  if (!rl) return { success: true, remaining: null, reset: null, enforced: false };

  try {
    const { success, remaining, reset } = await rl.limit(companyId);
    return { success, remaining, reset, enforced: true };
  } catch (err) {
    // A Redis outage must not block the page. Fail open and log it, rather than
    // denying a feature because the limiter is unreachable.
    console.error("[rate-limit] Upstash unreachable, allowing request:", err);
    return { success: true, remaining: null, reset: null, enforced: false };
  }
}

let earlyAccessLimiter: Ratelimit | null = null;

/**
 * The early-access form is the one unauthenticated write on the public site,
 * and it reaches three systems — trial_requests, Zoho and Clerk's waitlist.
 * Without a ceiling, a script turns the CRM into a bin, which is the opposite
 * of what the form is for.
 *
 * Keyed by caller IP rather than by email: the email column is already unique
 * and the procedure rejects a duplicate, so an email key would hand every new
 * address a fresh bucket and stop nothing.
 *
 * Five an hour is generous for a human filling in one form and still lets a
 * shared office NAT through. Fails open like the limiter above.
 */
export async function limitEarlyAccessRequests(ipAddress: string): Promise<RateLimitResult> {
  if (!isRateLimitConfigured) {
    return { success: true, remaining: null, reset: null, enforced: false };
  }
  if (!earlyAccessLimiter) {
    earlyAccessLimiter = new Ratelimit({
      redis: new Redis({ url: url!, token: token! }),
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "clarivo:early-access",
      analytics: false,
    });
  }

  try {
    const { success, remaining, reset } = await earlyAccessLimiter.limit(ipAddress);
    return { success, remaining, reset, enforced: true };
  } catch (err) {
    console.error("[rate-limit] Upstash unreachable, allowing early-access request:", err);
    return { success: true, remaining: null, reset: null, enforced: false };
  }
}
