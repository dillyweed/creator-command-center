import { Router } from "express";
import { fetchTikTokStats, isConfigured as tkConfigured } from "../services/tiktok.js";
import {
  fetchInstagramStats,
  isConfigured as igConfigured,
} from "../services/instagram.js";
import {
  saveSnapshot,
  latestSnapshot,
  recentSnapshots,
  isConfigured as sbConfigured,
} from "../services/supabase.js";
import { getClient, MODEL_SUBBOT, runMessage } from "../anthropic.js";
import { BOTS } from "../bots.js";
import {
  fetchTikTok as apifyTikTok,
  fetchInstagram as apifyInstagram,
  isConfigured as apifyConfigured,
} from "../services/apify.js";

const router = Router();

const EMPTY = {
  tiktok: { views: "", followers: "", engagement: "", posts: "" },
  instagram: { views: "", followers: "", engagement: "", posts: "" },
  revenue: "",
  deals: "",
};

// Which integrations are wired up (drives UI affordances).
router.get("/status", (_req, res) => {
  res.json({
    tiktok: tkConfigured(),
    instagram: igConfigured(),
    supabase: sbConfigured(),
  });
});

// Latest persisted stats. When Supabase is off, returns persisted:false so the
// frontend keeps using localStorage.
router.get("/", async (_req, res) => {
  if (!sbConfigured()) return res.json({ persisted: false, stats: null });
  const row = await latestSnapshot();
  res.json({
    persisted: true,
    stats: row?.data || null,
    source: row?.source || null,
    fetchedAt: row?.created_at || null,
  });
});

// History (for future sparklines). Empty array when Supabase is off.
router.get("/history", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  res.json({ snapshots: await recentSnapshots(limit) });
});

// Save manually-entered stats.
router.post("/", async (req, res) => {
  const stats = req.body?.stats;
  if (!stats || typeof stats !== "object") {
    return res.status(400).json({ error: "stats object is required" });
  }
  const row = await saveSnapshot(stats, "manual");
  res.json({ ok: true, persisted: Boolean(row), stats });
});

// Pull fresh numbers from TikTok + Instagram, merged over the baseline the
// client sends (so manual-only fields like posts/revenue/deals are preserved).
router.post("/refresh", async (req, res) => {
  const base = { ...EMPTY, ...(req.body?.stats || {}) };
  const merged = {
    ...base,
    tiktok: { ...EMPTY.tiktok, ...base.tiktok },
    instagram: { ...EMPTY.instagram, ...base.instagram },
  };
  const pulled = { tiktok: false, instagram: false };
  const errors = [];

  await Promise.all([
    (async () => {
      try {
        const t = await fetchTikTokStats();
        if (t.configured) {
          pulled.tiktok = true;
          merged.tiktok.views = t.views;
          merged.tiktok.followers = t.followers;
          if (t.engagement) merged.tiktok.engagement = t.engagement;
        }
      } catch (e) {
        errors.push(`tiktok: ${e.message}`);
      }
    })(),
    (async () => {
      try {
        const i = await fetchInstagramStats();
        if (i.configured) {
          pulled.instagram = true;
          merged.instagram.followers = i.followers;
          if (i.views) merged.instagram.views = i.views;
          if (i.engagement) merged.instagram.engagement = i.engagement;
        }
      } catch (e) {
        errors.push(`instagram: ${e.message}`);
      }
    })(),
  ]);

  if (pulled.tiktok || pulled.instagram) {
    await saveSnapshot(merged, "api");
  }

  res.json({
    stats: merged,
    pulled,
    configured: { tiktok: tkConfigured(), instagram: igConfigured() },
    errors,
  });
});

// Structured extractor: turn the Analytics bot's prose into card numbers.
// Structured extractor: turn the Analytics bot's prose into card numbers.
// NOTE: all fields are plain "number" (no ["number","null"] union, which the
// tool API can reject) and none are required - the model omits what it can't
// find, and we treat a missing field as "unknown".
const REPORT_TOOL = {
  name: "report_stats",
  description:
    "Return the numbers found in the analysis. OMIT any field the analysis could not determine - do not guess a precise number and do not send 0 for unknowns.",
  input_schema: {
    type: "object",
    properties: {
      tiktok: {
        type: "object",
        properties: {
          monthly_views: { type: "number", description: "Sum of views from posts in the last ~30 days" },
          followers: { type: "number" },
          engagement: { type: "number", description: "Engagement rate as a plain percent number, e.g. 4.2" },
          posts_per_week: { type: "number" },
        },
      },
      instagram: {
        type: "object",
        properties: {
          monthly_views: { type: "number" },
          followers: { type: "number" },
          engagement: { type: "number" },
          posts_per_week: { type: "number" },
        },
      },
    },
    required: ["tiktok", "instagram"],
  },
};

const num = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : null);

// POST /api/stats/analyze
// Loads the creator's TikTok/Instagram stats WITHOUT manual entry:
//   1. If TikTok/Instagram API tokens are configured, pull exact numbers first.
//   2. Run the Analytics bot with web search for a narrative + to fill gaps
//      (it prioritizes the always-public follower counts).
//   3. Extract the web numbers and fill any field the APIs didn't provide.
// body: { stats? } (baseline; revenue/deals are preserved). -> { stats, analysis, sources, pulled }
// POST /api/stats/analyze
// Accurate, username-only stats for ANY creator. Uses Apify actors first
// (exact scrape of the public profile) and falls back to a web-search estimate
// when Apify isn't configured or a lookup fails.
// body: { tiktokUsername?, instagramUsername?, period?, stats? }
// -> { stats, analysis, sources, pulled, period }
router.post("/analyze", async (req, res) => {
  if (!getClient() && !apifyConfigured()) {
    return res.status(503).json({
      error: "Server needs ANTHROPIC_API_KEY (estimates) or APIFY_TOKEN (accurate).",
    });
  }

  const period = [7, 28].includes(Number(req.body?.period)) ? Number(req.body.period) : 28;
  const base = { ...EMPTY, ...(req.body?.stats || {}) };
  const handles = {
    tiktok: String(req.body?.tiktokUsername || "").trim().replace(/^@/, ""),
    instagram: String(req.body?.instagramUsername || "").trim().replace(/^@/, ""),
  };

  const merged = {
    ...EMPTY,
    revenue: base.revenue ?? "",
    deals: base.deals ?? "",
    tiktok: { ...EMPTY.tiktok },
    instagram: { ...EMPTY.instagram },
  };
  const pulled = { tiktok: "none", instagram: "none" };
  const analysisParts = [];
  let sources = [];

  const fmtN = (n) => {
    const v = Number(n) || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(v);
  };
  const applyApify = (pf, r) => {
    merged[pf].followers = r.followers;
    merged[pf].views = r.views;
    if (r.engagement) merged[pf].engagement = r.engagement;
    if (r.postsPerWeek != null) merged[pf].posts = r.postsPerWeek;
    pulled[pf] = "apify";
    const label = pf === "tiktok" ? "TikTok" : "Instagram";
    const lines = (r.recentPosts || [])
      .map((p) => {
        const d = p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : "—";
        const v = p.views != null ? fmtN(p.views) + " views" : "no view count";
        return `- ${d} · ${v} · ${fmtN(p.likes)} likes${p.url ? " — " + p.url : ""}`;
      })
      .join("\n");
    analysisParts.push(
      `## ${label} @${handles[pf]} — live scrape (accurate)\n` +
        `Followers: ${fmtN(r.followers)}\n` +
        `Views (last ${period}d): ${fmtN(r.views)}\n` +
        `Engagement: ${r.engagement || 0}%\n` +
        `Posts/week: ${r.postsPerWeek ?? "—"}\n` +
        (lines ? `Recent posts:\n${lines}` : "")
    );
  };

  // 1. Apify first (accurate). Only for platforms with a username supplied.
  if (apifyConfigured()) {
    const [tk, ig] = await Promise.all([
      handles.tiktok ? apifyTikTok(handles.tiktok, period) : Promise.resolve({ ok: false }),
      handles.instagram ? apifyInstagram(handles.instagram, period) : Promise.resolve({ ok: false }),
    ]);
    if (tk.ok) applyApify("tiktok", tk);
    else if (handles.tiktok) pulled.tiktok = "failed";
    if (ig.ok) applyApify("instagram", ig);
    else if (handles.instagram) pulled.instagram = "failed";
  }

  // 2. Web-search estimate for any platform Apify didn't cover.
  const needEstimate = ["tiktok", "instagram"].filter(
    (pf) => handles[pf] && pulled[pf] !== "apify"
  );
  if (needEstimate.length && getClient()) {
    const targets = needEstimate
      .map((pf) => `${pf === "tiktok" ? "TikTok" : "Instagram"} @${handles[pf]}`)
      .join(" and ");
    try {
      const prompt =
        `Look up ${targets} and report current stats. ` +
        `FIRST find the FOLLOWER COUNT (public, always return a number, estimate if needed). ` +
        `THEN find recent videos with view counts and dates, sum the last ${period} days into PERIOD VIEWS, and estimate engagement rate (percent) and posts per week. ` +
        `List what you found with links. Give best estimates and label them; never leave a platform blank.`;
      const r = await runMessage({
        system: BOTS.analytics.system,
        messages: [{ role: "user", content: prompt }],
        model: MODEL_SUBBOT,
        maxTokens: 1400,
        webSearch: true,
      });
      sources = r.sources || [];
      analysisParts.push(
        `## Estimates via web search (${needEstimate.join(", ")})\n${r.text}`
      );

      let extracted = { tiktok: {}, instagram: {} };
      try {
        const ext = await getClient().messages.create({
          model: MODEL_SUBBOT,
          max_tokens: 500,
          system: `Extract the reported numbers into the report_stats tool. Use the last-${period}-days view total for monthly_views and percentages as plain numbers. OMIT any field the analysis did not determine.`,
          tools: [REPORT_TOOL],
          tool_choice: { type: "tool", name: "report_stats" },
          messages: [{ role: "user", content: r.text }],
        });
        const tu = ext.content.find((b) => b.type === "tool_use");
        if (tu?.input) extracted = tu.input;
      } catch (e) {
        console.warn("[stats/analyze] extraction failed:", e?.message);
      }
      for (const pf of needEstimate) {
        const e = extracted[pf] || {};
        if (merged[pf].followers === "" && num(e.followers) !== null) merged[pf].followers = e.followers;
        if (merged[pf].views === "" && num(e.monthly_views) !== null) merged[pf].views = e.monthly_views;
        if (merged[pf].engagement === "" && num(e.engagement) !== null) merged[pf].engagement = e.engagement;
        if (merged[pf].posts === "" && num(e.posts_per_week) !== null) merged[pf].posts = e.posts_per_week;
        if (merged[pf].followers !== "" || merged[pf].views !== "") pulled[pf] = "estimate";
      }
    } catch (err) {
      console.error("[stats/analyze] web lookup failed:", err?.message || err);
    }
  }

  const gotAnything =
    merged.tiktok.followers !== "" || merged.instagram.followers !== "";
  if (!gotAnything) {
    return res.status(502).json({
      error: "Couldn't pull stats. Check the usernames, or add an APIFY_TOKEN for accurate data.",
    });
  }

  if (sbConfigured()) await saveSnapshot(merged, "analyze");
  res.json({
    stats: merged,
    analysis: analysisParts.join("\n\n"),
    sources,
    pulled,
    period,
  });
});

export default router;
