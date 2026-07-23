// Thin client for the Express backend. The base URL comes from VITE_API_URL
// (set in Vercel for prod; defaults to localhost for dev).
const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8787").replace(
  /\/+$/,
  ""
);

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function get(path) {
  const res = await fetch(BASE + path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Direct 1:1 chat with Research / Analytics / CEO.
// -> { reply }
export function sendChat(botId, messages) {
  return post(`/api/chat/${botId}`, { messages });
}

// CEO orchestration: plan -> delegate -> synthesize.
// -> { reply, subAgents: [{ bot, name, prompt, output }] }
export function orchestrate(messages, inspiration = [], period = 30) {
  return post(`/api/orchestrate`, { messages, inspiration, period });
}

// --- Stats (step 7) ---
export function getStatsStatus() {
  return get("/api/stats/status");
}
export function getStats() {
  return get("/api/stats");
}
export function putStats(stats) {
  return post("/api/stats", { stats });
}
export function refreshStats(stats) {
  return post("/api/stats/refresh", { stats });
}
export function analyzeStats(stats, period, accounts = {}, conns = {}) {
  return post("/api/stats/analyze", {
    stats,
    period,
    tiktokUsername: accounts.tiktok,
    instagramUsername: accounts.instagram,
    tiktokConn: conns.tiktok,
    instagramConn: conns.instagram,
  });
}

// Full-page redirect target that starts the provider login.
export function connectUrl(platform) {
  return `${BASE}/api/auth/${platform}`;
}

export const API_BASE = BASE;
