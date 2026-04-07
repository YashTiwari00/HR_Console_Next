/**
 * Shared OpenRouter API helper — server-side only.
 * Uses OPENROUTER_API_KEY from env.
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://hr-console.app",
  "X-Title": "HR Console",
});

/**
 * Non-streaming call — returns the full assistant content string.
 * @param {{ model?: string, messages: Array<{role:string,content:string}>, jsonMode?: boolean, maxTokens?: number }} opts
 * @returns {Promise<string>}
 */
export async function callOpenRouter({ model = "openai/gpt-4o-mini", messages, jsonMode = false, maxTokens = 120 }) {
  const response = await callOpenRouterWithUsage({ model, messages, jsonMode, maxTokens });
  return response.content;
}

/**
 * Non-streaming call — returns assistant content and provider usage metadata.
 * @param {{ model?: string, messages: Array<{role:string,content:string}>, jsonMode?: boolean, maxTokens?: number }} opts
 * @returns {Promise<{ content: string, usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } | null, model: string | null }>}
 */
export async function callOpenRouterWithUsage({
  model = "openai/gpt-4o-mini",
  messages,
  jsonMode = false,
  maxTokens = 120,
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");

  const body = { model, messages, temperature: 0.7, max_tokens: jsonMode ? 600 : maxTokens };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: HEADERS(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  const data = await res.json();

  const usage = data?.usage
    ? {
        prompt_tokens: Number(data.usage.prompt_tokens || 0),
        completion_tokens: Number(data.usage.completion_tokens || 0),
        total_tokens: Number(data.usage.total_tokens || 0),
      }
    : null;

  return {
    content: data.choices?.[0]?.message?.content ?? "",
    usage,
    model: data?.model ?? null,
  };
}

/**
 * Streaming call — returns a ReadableStream of plain-text token chunks.
 * Parses OpenRouter SSE and emits only the token content.
 * @param {{ model?: string, messages: Array<{role:string,content:string}>, maxTokens?: number }} opts
 * @returns {Promise<ReadableStream<Uint8Array>>}
 */
export async function streamOpenRouter({ model = "openai/gpt-4o-mini", messages, maxTokens = 120 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");

  const upstream = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: HEADERS(apiKey),
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens, stream: true }),
  });

  if (!upstream.ok) throw new Error(`OpenRouter ${upstream.status}: ${await upstream.text()}`);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep incomplete last line

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") { controller.close(); return; }
            try {
              const token = JSON.parse(payload)?.choices?.[0]?.delta?.content;
              if (token) controller.enqueue(encoder.encode(token));
            } catch { /* skip malformed chunk */ }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}
