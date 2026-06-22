import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";

export const isAiAvailable = apiKey.length > 0;

let _client: Anthropic | null = null;

export function getClient(): Anthropic | null {
  if (!isAiAvailable) return null;
  if (!_client) {
    _client = new Anthropic({
      apiKey,
    });
  }
  return _client;
}

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const block = response.content[0];
    if (block && block.type === "text") {
      return block.text;
    }
    return null;
  } catch {
    return null;
  }
}
