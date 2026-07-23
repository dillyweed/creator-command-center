// Inspiration channels: scrape creators the user wants to model, surface their
// recent OUTLIERS (views >> their own average), and hand the bots real data to
// analyze — "what's working right now" for accounts worth copying.
//
// Reuses the Apify profile scrapers already wired for the user's own accounts.

import {
  fetchTikTok,
  fetchInstagram,
  isConfigured as apifyConfigured,
} from "./apify.js";

const fmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(v);
};

// channels: [{ platform: "tiktok"|"instagram", username }]
// -> { ok, apify, runs, channels: [ per-channel summary ] }
export async function fetchInspiration(channels, periodDays = 30, opts = {}) {
  const maxChannels = opts.maxChannels || 8;
  const list = (Array.isArray(channels) ? channels : [])
    .map((c) => ({
      platform: c?.platform === "instagram" ? "instagram" : "tiktok",
      username: String(c?.username || "").trim().replace(/^@/, ""),
    }))
    .filter((c) => c.username)
    .slice(0, maxChannels);

  if (!list.length) return { ok: false, apify: apifyConfigured(), runs: 0, channels: [] };
  if (!apifyConfigured()) return { ok: false, apify: false, runs: 0, channels: list };

  const results = await Promise.all(
    list.map(async (c) => {
      try {
        const r =
          c.platform === "instagram"
            ? await fetchInstagram(c.username, periodDays)
            : await fetchTikTok(c.username, periodDays);
        if (!r.ok) return { ...c, ok: false, error: r.error || "no data" };

        const withViews = (r.recentPosts || []).filter((p) => p.views != null);
        const avg = withViews.length
          ? Math.round(withViews.reduce((s, p) => s + (p.views || 0), 0) / withViews.length)
          : 0;
        const top = [...withViews]
          .sort((a, b) => (b.views || 0) - (a.views || 0))
          .slice(0, 5)
          .map((p) => ({
            url: p.url || null,
            views: p.views,
            likes: p.likes,
            createdAt: p.createdAt || null,
            vsAvg: avg ? Number(((p.views || 0) / avg).toFixed(1)) : null,
            vsFollowers: r.followers ? Number(((p.views || 0) / r.followers).toFixed(2)) : null,
          }));
        return {
          ...c,
          ok: true,
          followers: r.followers,
          periodViews: r.views,
          avgViews: avg,
          postsPerWeek: r.postsPerWeek,
          topPosts: top,
        };
      } catch (e) {
        return { ...c, ok: false, error: e.message };
      }
    })
  );

  return { ok: results.some((r) => r.ok), apify: true, runs: list.length, channels: results };
}

// Render scraped intel into a text block the Research/CEO bots can reason over.
export function inspirationBlock(data, periodDays = 30) {
  const ok = (data?.channels || []).filter((c) => c.ok && c.topPosts?.length);
  if (!ok.length) return "";
  const sections = ok.map((c) => {
    const posts = c.topPosts
      .map((p) => {
        const bits = [];
        if (p.vsAvg) bits.push(`${p.vsAvg}x their avg`);
        if (p.vsFollowers) bits.push(`${p.vsFollowers}x followers`);
        const meta = bits.length ? ` (${bits.join(", ")})` : "";
        const when = p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : "—";
        return `  - ${fmt(p.views)} views${meta} · ${when}${p.url ? " · " + p.url : ""}`;
      })
      .join("\n");
    return (
      `### ${c.platform === "instagram" ? "Instagram" : "TikTok"} @${c.username} — ` +
      `${fmt(c.followers)} followers, avg ${fmt(c.avgViews)} views/post\n` +
      `Top recent posts (last ${periodDays}d, sorted by views):\n${posts}`
    );
  });
  return (
    `INSPIRATION CHANNELS INTEL — real scraped data from creators the user wants to model. ` +
    `Treat this as your PRIMARY signal. For each, find the biggest OUTLIERS (views far above their own average), ` +
    `reverse-engineer the exact hook/format/topic driving them, and flag what's working vs. flopping:\n\n` +
    sections.join("\n\n")
  );
}
