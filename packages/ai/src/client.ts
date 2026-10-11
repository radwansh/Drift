import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";

export const isAiAvailable = apiKey.length > 0;

/**
 * The previously hardcoded `claude-sonnet-4-20250514` was retired on 15 June 2026,
 * so every AI call in Drift failed silently (finding A2). The model is now
 * configurable; the default stays on a current ID.
 */
export const DEFAULT_MODEL = process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-5";

/** These calls sit on a page-load path, so a slow model must not hold the request. */
const REQUEST_TIMEOUT_MS = 20_000;
/** Five bullets of prose; 4096 was wasteful. */
const MAX_TOKENS = 800;

let _client: Anthropic | null = null;

export function getClient(): Anthropic | null {
  if (!isAiAvailable) return null;
  if (!_client) {
    _client = new Anthropic({
      apiKey,
      // The TypeScript SDK takes milliseconds. The default is 10 minutes, which
      // would hang a page load; 1 retry instead of the default 2 keeps the worst
      // case inside roughly 40s.
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 1,
    });
  }
  return _client;
}

export interface ClaudeResult {
  /** The model's text, or null when the call produced none. */
  text: string | null;
  /** Human-readable failure reason, or null on success. */
  error: string | null;
  /** Which model actually answered, for cache attribution. */
  model: string | null;
}

/**
 * Returns the error rather than swallowing it (findings A2 and C16), so callers can
 * tell "AI unavailable" apart from "AI returned nothing" and avoid caching a failure
 * as though it were model output.
 */
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
): Promise<ClaudeResult> {
  const client = getClient();
  if (!client) {
    return { text: null, error: "ANTHROPIC_API_KEY is not configured", model: null };
  }

  try {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      // Short structured output on a request path: thinking would eat both the
      // token budget and the timeout.
      thinking: { type: "disabled" },
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    // Compared as a string because the pinned @anthropic-ai/sdk (0.39.x) predates
    // the `refusal` stop reason and does not include it in the union, while the
    // live API can still return it.
    if (String(response.stop_reason) === "refusal") {
      return { text: null, error: "Model declined the request", model: response.model };
    }

    const block = response.content.find((b) => b.type === "text");
    if (block && block.type === "text") {
      return { text: block.text, error: null, model: response.model };
    }
    return {
      text: null,
      error: `Model returned no text block (stop_reason: ${response.stop_reason})`,
      model: response.model,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Logged rather than silent: a retired model or a bad key previously looked
    // identical to "no API key" from the UI.
    console.error(`[ai] callClaude failed (model ${DEFAULT_MODEL}): ${message}`);
    return { text: null, error: message, model: null };
  }
}
