// Lightweight activity log for the dashboard feed + bot status. Stored in
// localStorage; swaps to Supabase bot_logs later without changing callers.
const KEY = "cc-activity";
const MAX = 50;

export function loadActivity() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

// entry: { bot, botName, summary, meta? }
export function logActivity(entry) {
  const list = loadActivity();
  list.unshift({ ...entry, at: Date.now() });
  const trimmed = list.slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
  return trimmed;
}

// Most recent entry per bot id -> { [botId]: entry }.
export function lastByBot() {
  const map = {};
  for (const e of loadActivity()) {
    if (!map[e.bot]) map[e.bot] = e;
  }
  return map;
}

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
