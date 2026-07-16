// Accurate TikTok + Instagram stats from just a username, via Apify actors.
// The app owner sets ONE server-side token (APIFY_TOKEN); end users only type a
// handle and authenticate nothing. Falls back gracefully (isConfigured()=false)
// when no token is set, so the app still runs on web-search estimates.
//
// Actors (override via env if needed):
//   TikTok:    clockworks~tiktok-profile-scraper  -> per-video items, each with
//              authorMeta.fans (followers), playCount (views), diggCount,
//              commentCount, shareCount, createTimeISO, isPinned.
//   Instagram: apify~instagram-profile-scraper    -> one profile item with
//              followersCount, postsCount, latestPosts[] (likesCount,
//              commentsCount, videoViewCount, timestamp, type, url).

const BASE = "https://api.apify.com/v2/acts";
const TIKTOK_ACTOR = process.env.APIFY_TIKTOK_ACTOR || "clockworks~tiktok-profile-scraper";
const IG_ACTOR = process.env.APIFY_INSTAGRAM_ACTOR || "apify~instagram-profile-scraper";
const MAX_POSTS = Number(process.env.APIFY_MAX_POSTS || 30);

export function isConfigured() {
  return Boolean(process.env.APIFY_TOKEN);
}

const clean = (u) => String(u || "").trim().replace(/^@/, "");

// Run an actor synchronously and return its dataset items.
async function runActor(actorId, input, timeoutMs = 90000) {
  const url =
    `${BASE}/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(process.env.APIFY_TOKEN)}` +
    `&maxItems=${MAX_POSTS}&timeout=120`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Apify ${actorId} HTTP ${res.status}`);
    const items = await res.json();
    return Array.isArray(items) ? items : [];
  } finally {
    clearTimeout(timer);
  }
}

// Shared math: period views, engagement %, posts/week from normalized posts.
function compute(followers, posts, periodDays) {
  const cutoff = Date.now() - periodDays * 86400000;
  const withDates = posts.filter((p) => p.createdAt);
  const recent = withDates.filter(
    (p) => new Date(p.createdAt).getTime() >= cutoff
  );
  // If dates are missing, fall back to all posts so we still return something.
  const window = recent.length ? recent : posts;

  const views = window.reduce((s, p) => s + (Number(p.views) || 0), 0);

  const engPosts = window.filter(
    (p) => Number(p.likes) || Number(p.comments)
  );
  let engagement = 0;
  if (followers && engPosts.length) {
    const avg =
      engPosts.reduce(
        (s, p) =>
          s +
          (Number(p.likes) || 0) +
          (Number(p.comments) || 0) +
          (Number(p.shares) || 0),
        0
      ) / engPosts.length;
    engagement = Number(((avg / followers) * 100).toFixed(1));
  }

  const postsPerWeek = recent.length
    ? Number((recent.length / (periodDays / 7)).toFixed(1))
    : null;

  return { views, engagement, postsPerWeek, counted: window.length };
}

// -> { ok, source:"apify", followers, views, engagement, postsPerWeek, verified,
//      recentPosts:[{views,likes,comments,createdAt,url}] } | { ok:false, error }
export async function fetchTikTok(username, periodDays = 28) {
  const u = clean(username);
  if (!isConfigured() || !u) return { ok: false, error: "not configured" };
  try {
    const items = await runActor(TIKTOK_ACTOR, {
      profiles: [u],
      resultsPerPage: MAX_POSTS,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
    });
    const valid = items.filter((i) => !i.errorCode && i.authorMeta);
    if (!valid.length) {
      const err = items.find((i) => i.errorCode);
      return { ok: false, error: err?.error || "no TikTok data" };
    }
    const author = valid[0].authorMeta;
    const posts = valid.map((i) => ({
      views: i.playCount,
      likes: i.diggCount,
      comments: i.commentCount,
      shares: i.shareCount,
      createdAt: i.createTimeISO,
      url: i.webVideoUrl,
      pinned: i.isPinned,
    }));
    const followers = Number(author.fans) || 0;
    const m = compute(followers, posts, periodDays);
    return {
      ok: true,
      source: "apify",
      followers,
      verified: Boolean(author.verified),
      views: m.views,
      engagement: m.engagement,
      postsPerWeek: m.postsPerWeek,
      recentPosts: posts
        .filter((p) => !p.pinned)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function fetchInstagram(username, periodDays = 28) {
  const u = clean(username);
  if (!isConfigured() || !u) return { ok: false, error: "not configured" };
  try {
    const items = await runActor(IG_ACTOR, {
      usernames: [u],
      resultsLimit: MAX_POSTS,
    });
    const profile = items.find((i) => i && !i.error && i.username);
    if (!profile) {
      const err = items.find((i) => i?.error);
      return { ok: false, error: err?.error || "no Instagram data" };
    }
    const latest = Array.isArray(profile.latestPosts) ? profile.latestPosts : [];
    const posts = latest.map((p) => ({
      views: p.videoViewCount ?? p.videoPlayCount ?? null,
      likes: p.likesCount,
      comments: p.commentsCount,
      createdAt: p.timestamp,
      url: p.url,
      type: p.type,
    }));
    const followers = Number(profile.followersCount) || 0;
    const m = compute(followers, posts, periodDays);
    return {
      ok: true,
      source: "apify",
      followers,
      verified: Boolean(profile.verified),
      views: m.views,
      engagement: m.engagement,
      postsPerWeek: m.postsPerWeek,
      recentPosts: posts
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
