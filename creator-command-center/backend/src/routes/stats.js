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
const REPORT_TOOL = {
  name: "report_stats",
  description:
    "Return the numbers found in the analysis. Use null for anything the analysis could not determine (do not guess a precise number).",
  input_schema: {
    type: "object",
    properties: {
      tiktok: {
        type: "object",
        properties: {
          monthly_views: { type: ["number", "null"], description: "Sum of views from posts in the last ~30 days" },
          followers: { type: ["number", "null"] },
          engagement: { type: ["number", "null"], description: "Engagement rate as a plain percent number, e.g. 4.2" },
          posts_per_week: { type: ["number", "null"] },
        },
      },
      instagram: {
        type: "object",
        properties: {
          monthly_views: { type: ["number", "null"] },
          followers: { type: ["number", "null"] },
          engagement: { type: ["number", "null"] },
          posts_per_week: { type: ["number", "null"] },
        },
      },
    },
    required: ["tiktok", "instagram"],
  },
};

const coerce = (v) => (v === null || v === undefined ? "" : v);

// POST /api/stats/analyze
// The Analytics bot looks up the creator's public channels with web search,
// computes monthly (last-30-days) views, then a second pass extracts the
// numbers into the dashboard's card shape. body: { stats? } (baseline to keep
// revenue/deals/posts). -> { stats, analysis, sources }
router.post("/analyze", async (req, res) => {
  if (!getClient()) {
    return res
      .status(503)
      .json({ error: "Server is missing ANTHROPIC_API_KEY. Add it to .env." });
  }

  const base = { ...EMPTY, ...(req.body?.stats || {}) };
  const merged = {
    ...base,
    tiktok: { ...EMPTY.tiktok, ...base.tiktok },
    instagram: { ...EMPTY.instagram, ...base.instagram },
  };

  try {
    // 1. Analytics bot with web search.
    const prompt =
      "Look up my public channels and compute my current stats. TikTok @dylanwallaceyt and Instagram @dylanwalllace. " +
      "For EACH platform: find my recent videos with their view counts and post dates, SUM the views of posts from the last 30 days to get my MONTHLY VIEWS, estimate my follower count, estimate engagement rate as a percent, and estimate how many posts per week I average. " +
      "List the videos you counted, then state the final numbers plainly per platform. Label anything you could not confirm as an estimate.";

    const { text: analysis, sources } = await runMessage({
      system: BOTS.analytics.system,
      messages: [{ role: "user", content: prompt }],
      model: MODEL_SUBBOT,
      maxTokens: 1600,
      webSearch: true,
    });

    // 2. Extract numbers into the card shape (no web search).
    let extracted = { tiktok: {}, instagram: {} };
    try {
      const ext = await getClient().messages.create({
        model: MODEL_SUBBOT,
        max_tokens: 500,
        system:
          "Extract the reported numbers into the report_stats tool. Use the last-30-days figure for monthly_views. Percentages as plain numbers. Use null for anything the analysis did not determine.",
        tools: [REPORT_TOOL],
        tool_choice: { type: "tool", name: "report_stats" },
        messages: [{ role: "user", content: analysis }],
      });
      const tu = ext.content.find((b) => b.type === "tool_use");
      if (tu?.input) extracted = tu.input;
    } catch (e) {
      console.warn("[stats/analyze] extraction failed:", e?.message);
    }

    // 3. Fill card fields. "views" holds the monthly (30d) total.
    for (const pf of ["tiktok", "instagram"]) {
      const e = extracted[pf] || {};
      merged[pf].views = coerce(e.monthly_views);
      merged[pf].followers = coerce(e.followers);
      if (e.engagement != null) merged[pf].engagement = e.engagement;
      if (e.posts_per_week != null) merged[pf].posts = e.posts_per_week;
    }

    if (sbConfigured()) await saveSnapshot(merged, "analytics");

    res.json({ stats: merged, analysis, sources });
  } catch (err) {
    console.error("[stats/analyze] error:", err?.message || err);
    res.status(502).json({ error: "Analytics lookup failed." });
  }
});

export default router;
