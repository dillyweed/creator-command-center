// Stat persistence + formatting for the dashboard.
// Step 3 stores stats locally (localStorage). Step 7 swaps this for the
// TikTok/Instagram APIs + Supabase without changing the component.

const KEY = "cc-stats";

export const DEFAULT_STATS = {
  tiktok: { views: "", followers: "", engagement: "", posts: "" },
  instagram: { views: "", followers: "", engagement: "", posts: "" },
  revenue: "",
  deals: "",
};

export function loadStats() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATS);
    const parsed = JSON.parse(raw);
    // merge over defaults so missing keys never break the UI
    return {
      ...structuredClone(DEFAULT_STATS),
      ...parsed,
      tiktok: { ...DEFAULT_STATS.tiktok, ...(parsed.tiktok || {}) },
      instagram: { ...DEFAULT_STATS.instagram, ...(parsed.instagram || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_STATS);
  }
}

export function saveStats(stats) {
  localStorage.setItem(KEY, JSON.stringify(stats));
}

// 12300 -> "12.3K", 2_400_000 -> "2.4M", 0/empty -> "—"
export function fmt(n) {
  const v = Number(n) || 0;
  if (!v) return "—";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(v);
}

export function fmtMoney(n) {
  const v = Number(n) || 0;
  if (!v) return "—";
  return "$" + v.toLocaleString();
}

export const totalViews = (s) =>
  (Number(s.tiktok.views) || 0) + (Number(s.instagram.views) || 0);

export const totalFollowers = (s) =>
  (Number(s.tiktok.followers) || 0) + (Number(s.instagram.followers) || 0);
