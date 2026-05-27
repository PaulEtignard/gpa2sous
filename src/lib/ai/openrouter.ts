/**
 * Thin wrapper around the OpenRouter chat-completions API (OpenAI-compatible).
 *
 * OpenRouter offers a unified gateway to dozens of LLM providers — we use it
 * because it lets us swap models (Claude Haiku, GPT-4o-mini, Mistral…) via a
 * single env var, without changing any code.
 *
 * Server-side only — never expose OPENROUTER_API_KEY in client bundles.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  responseFormat?: "text" | "json_object";
  maxTokens?: number;
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY n'est pas défini. Ajoute-le à .env.local (sans préfixe NEXT_PUBLIC_).",
    );
  }

  const model = options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  // response_format: json_object is only supported by a subset of models
  // (OpenAI, some Claude versions). Free / small models ignore or reject it,
  // returning an empty response. We rely on the prompt + regex fallback instead.
  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 4000,
  };

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://gpadesous.local",
      "X-Title": "Gpadesous",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`OpenRouter: ${data.error.message ?? "unknown error"}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter: réponse vide");
  }
  return content;
}
