// Single shared Anthropic client + a helper for running a bot turn, with
// optional server-side web search (build brief step 6 - the Research bot needs
// to find real videos in real time).
import Anthropic from "@anthropic-ai/sdk";

let client = null;

export function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const MODEL_SUBBOT = process.env.MODEL_SUBBOT || "claude-sonnet-4-6";
export const MODEL_CEO = process.env.MODEL_CEO || "claude-opus-4-8";

const WEB_SEARCH_MAX_USES = Number(process.env.WEB_SEARCH_MAX_USES || 6);

// Anthropic server-side web search tool. The model runs the searches itself
// and returns the answer with citations in one response - no client-side loop.
export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: WEB_SEARCH_MAX_USES,
};

// Pull the plain text out of a Messages API response.
export function textOf(message) {
  if (!message?.content) return "";
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Collect deduped {url, title} pairs from any web_search_tool_result blocks.
export function sourcesOf(message) {
  const out = [];
  const seen = new Set();
  for (const block of message?.content || []) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result" && r.url && !seen.has(r.url)) {
          seen.add(r.url);
          out.push({ url: r.url, title: r.title || r.url });
        }
      }
    }
  }
  return out;
}

// Run one bot turn. Returns { text, sources }. When webSearch is true, the
// web_search tool is attached and sources are extracted from the result.
export async function runMessage({
  system,
  messages,
  model,
  maxTokens = 1100,
  webSearch = false,
}) {
  const c = getClient();
  if (!c) throw new Error("Missing ANTHROPIC_API_KEY");

  const req = { model, max_tokens: maxTokens, system, messages };
  if (webSearch) req.tools = [WEB_SEARCH_TOOL];

  const message = await c.messages.create(req);
  return { text: textOf(message), sources: webSearch ? sourcesOf(message) : [] };
}
