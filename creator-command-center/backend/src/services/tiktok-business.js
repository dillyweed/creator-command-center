// TikTok Business API (Organic Accounts) — accurate account analytics that
// match TikTok Studio: real Video Views over a date range, followers, and
// engagement. This is what the Display API (Login Kit) cannot give.
//
// REQUIRES (you must set this up):
//   - An app on business-api.tiktok.com with **Organic Accounts API** access
//     APPROVED by TikTok (a separate, reviewed application).
//   - A TikTok **Business** account connected.
//   - Env: TIKTOK_BUSINESS_APP_ID, TIKTOK_BUSINESS_APP_SECRET.
// Same "Connect TikTok" UX as before — only the backend endpoints differ.
//
// NOTE: TikTok periodically revises these endpoints/field names. Base URLs and
// the metric fields are env-overridable so you can match your approved app's
// current docs without a code change.

const APP_ID = process.env.TIKTOK_BUSINESS_APP_ID || "";
const APP_SECRET = process.env.TIKTOK_BUSINESS_APP_SECRET || "";
const BASE =
  process.env.TIKTOK_BUSINESS_BASE || "https://business-api.tiktok.com/open_api/v1.3";
const AUTH_URL =
  process.env.TIKTOK_BUSINESS_AUTH || "https://business-api.tiktok.com/portal/auth";
// Account metrics to request from business/get (override if your app differs).
const FIELDS = (
  process.env.TIKTOK_BUSINESS_FIELDS ||
  "followers_count,video_views,profile_views,likes,comments,shares,reach"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function businessConfigured() {
  return Boolean(APP_ID && APP_SECRET);
}

export function businessAuthUrl(state, redirectUri) {
  const p = new URLSearchParams({
    app_id: APP_ID,
    state,
    redirect_uri: redirectUri,
  });
  return `${AUTH_URL}?${p}`;
}

// Exchange the auth_code returned by the business portal for tokens.
export async function exchangeBusiness(authCode) {
  const res = await fetch(`${BASE}/tt_user/oauth2/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: APP_ID,
      secret: APP_SECRET,
      auth_code: authCode,
      grant_type: "authorization_code",
    }),
  });
  const j = await res.json();
  const d = j?.data || {};
  if (!d.access_token) throw new Error(j?.message || "TikTok Business token error");
  return {
    platform: "tiktok",
    api: "business",
    account_id: d.open_id || d.business_id || d.advertiser_ids?.[0] || "",
    access_token: d.access_token,
    refresh_token: d.refresh_token || null,
    expires_at: new Date(Date.now() + (Number(d.expires_in) || 0) * 1000).toISOString(),
  };
}

// Refresh a 24h-expiring business token. Returns an updated connection record.
export async function refreshBusiness(conn) {
  if (!conn.refresh_token) throw new Error("No refresh token");
  const res = await fetch(`${BASE}/tt_user/oauth2/refresh_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: APP_ID,
      secret: APP_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  const d = j?.data || {};
  if (!d.access_token) throw new Error(j?.message || "TikTok Business refresh error");
  return {
    ...conn,
    access_token: d.access_token,
    refresh_token: d.refresh_token || conn.refresh_token,
    expires_at: new Date(Date.now() + (Number(d.expires_in) || 0) * 1000).toISOString(),
  };
}

export function isExpired(conn) {
  return conn.expires_at ? new Date(conn.expires_at).getTime() <= Date.now() + 60000 : false;
}

const ymd = (d) => d.toISOString().slice(0, 10);

// Pull a numeric value out of TikTok's varied shapes (scalar, {value}, or a
// list of daily points to sum).
function n(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (Array.isArray(v)) return v.reduce((s, x) => s + n(x), 0);
  if (typeof v === "object") {
    if ("value" in v) return Number(v.value) || 0;
    return 0;
  }
  return Number(v) || 0;
}
// Read a metric from either the top-level data object or a metrics[] array.
function metric(data, field, { latest = false } = {}) {
  if (data && field in data) return n(data[field]);
  if (Array.isArray(data?.metrics)) {
    const vals = data.metrics.map((m) => n(m?.[field]));
    if (latest) return vals.length ? vals[vals.length - 1] : 0;
    return vals.reduce((s, x) => s + x, 0);
  }
  return 0;
}

// -> { ok, source, followers, views, engagement, postsPerWeek }
export async function fetchBusinessStats(conn, periodDays) {
  const end = new Date();
  const start = new Date(Date.now() - periodDays * 86400000);
  const url = new URL(`${BASE}/business/get/`);
  url.searchParams.set("business_id", conn.account_id);
  url.searchParams.set("fields", JSON.stringify(FIELDS));
  url.searchParams.set("start_date", ymd(start));
  url.searchParams.set("end_date", ymd(end));

  const res = await fetch(url, { headers: { "Access-Token": conn.access_token } });
  const j = await res.json();
  if (j?.code && j.code !== 0) throw new Error(j.message || `TikTok Business API code ${j.code}`);
  const d = j?.data || {};

  const followers = metric(d, "followers_count", { latest: true });
  const views = metric(d, "video_views"); // summed over the date range = "Video Views (Nd)"
  const interactions =
    metric(d, "likes") + metric(d, "comments") + metric(d, "shares");
  const engagement = views
    ? Number(((interactions / views) * 100).toFixed(1))
    : followers
    ? Number(((interactions / followers) * 100).toFixed(1))
    : 0;

  return {
    ok: true,
    source: "tiktok-business",
    followers,
    views,
    engagement,
    postsPerWeek: null,
  };
}
