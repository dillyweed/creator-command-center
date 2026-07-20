// OAuth "Connect your account" flow for TikTok (Login Kit) and Instagram
// (via Facebook Login / Graph API). Pulls official analytics once a creator
// authorizes. This is the accurate, ToS-compliant path.
//
// IMPORTANT (production reality):
//  - You must register apps at developers.tiktok.com and developers.facebook.com,
//    set the redirect URIs below, and put the client IDs/secrets in env vars.
//  - Until each app passes App Review, OAuth only works for your own test users.
//  - Instagram works ONLY for Business/Creator accounts (Basic Display is gone).
//
// Token storage: Supabase table `oauth_connections` when SUPABASE_* is set,
// otherwise an in-memory Map (fine for a single instance while testing).

import crypto from "node:crypto";
import {
  businessConfigured,
  businessAuthUrl,
  exchangeBusiness,
  refreshBusiness,
  fetchBusinessStats,
  isExpired,
} from "./tiktok-business.js";

const TT_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TT_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const META_APP_ID = process.env.META_APP_ID || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
const META_VER = process.env.META_API_VERSION || "v20.0";

// Public base URL of THIS backend (e.g. https://xxx.up.railway.app). Used to
// build the OAuth redirect URIs, which must match what you register.
const REDIRECT_BASE = (process.env.OAUTH_REDIRECT_BASE || "").replace(/\/+$/, "");

export function redirectUri(platform) {
  return `${REDIRECT_BASE}/api/auth/${platform}/callback`;
}

export function isConfigured(platform) {
  if (!REDIRECT_BASE) return false;
  if (platform === "tiktok")
    return Boolean((TT_CLIENT_KEY && TT_CLIENT_SECRET) || businessConfigured());
  if (platform === "instagram") return Boolean(META_APP_ID && META_APP_SECRET);
  return false;
}

// ---- connection store ----------------------------------------------------
const mem = new Map();
let sbPromise = null;
function sbEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}
async function sb() {
  if (!sbEnabled()) return null;
  if (!sbPromise) {
    sbPromise = import("@supabase/supabase-js")
      .then(({ createClient }) =>
        createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      )
      .catch(() => null);
  }
  return sbPromise;
}

export async function saveConnection(rec) {
  const record = { ...rec, updated_at: new Date().toISOString() };
  const client = await sb();
  if (client) {
    await client.from("oauth_connections").upsert(record, { onConflict: "conn_key" });
  } else {
    mem.set(record.conn_key, record);
  }
  return record.conn_key;
}

export async function getConnection(connKey) {
  if (!connKey) return null;
  const client = await sb();
  if (client) {
    const { data } = await client
      .from("oauth_connections")
      .select("*")
      .eq("conn_key", connKey)
      .maybeSingle();
    return data || null;
  }
  return mem.get(connKey) || null;
}

// ---- auth URLs -----------------------------------------------------------
// state carries a freshly generated conn_key so the callback knows where to
// store the token. (For hardened production, also bind state to a cookie.)
export function newConnKey() {
  return crypto.randomUUID();
}
function encodeState(connKey) {
  return Buffer.from(JSON.stringify({ k: connKey, t: Date.now() })).toString("base64url");
}
export function decodeState(state) {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return null;
  }
}

export function authUrl(platform, connKey) {
  const state = encodeState(connKey);
  if (platform === "tiktok" && businessConfigured()) {
    return businessAuthUrl(state, redirectUri("tiktok"));
  }
  if (platform === "tiktok") {
    const p = new URLSearchParams({
      client_key: TT_CLIENT_KEY,
      scope: "user.info.basic,user.info.stats,video.list",
      response_type: "code",
      redirect_uri: redirectUri("tiktok"),
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
  }
  if (platform === "instagram") {
    const p = new URLSearchParams({
      client_id: META_APP_ID,
      redirect_uri: redirectUri("instagram"),
      response_type: "code",
      scope:
        "instagram_basic,instagram_manage_insights,pages_show_list,business_management",
      state,
    });
    return `https://www.facebook.com/${META_VER}/dialog/oauth?${p}`;
  }
  return null;
}

// ---- code exchange + fetch ----------------------------------------------
export async function exchangeTikTokAuto(code) {
  return businessConfigured() ? exchangeBusiness(code) : exchangeTikTok(code);
}

export async function exchangeTikTok(code) {
  const body = new URLSearchParams({
    client_key: TT_CLIENT_KEY,
    client_secret: TT_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri("tiktok"),
  });
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error_description || j.error || "TikTok token error");
  return {
    platform: "tiktok",
    account_id: j.open_id,
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: new Date(Date.now() + (j.expires_in || 0) * 1000).toISOString(),
  };
}

export async function exchangeInstagram(code) {
  // 1. short-lived user token
  const tokRes = await fetch(
    `https://graph.facebook.com/${META_VER}/oauth/access_token?` +
      new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: redirectUri("instagram"),
        code,
      })
  );
  const tok = await tokRes.json();
  if (!tokRes.ok || tok.error) throw new Error(tok.error?.message || "Meta token error");

  // 2. exchange for a long-lived token (~60 days)
  const llRes = await fetch(
    `https://graph.facebook.com/${META_VER}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: tok.access_token,
      })
  );
  const ll = await llRes.json();
  const userToken = ll.access_token || tok.access_token;

  // 3. find the linked IG Business account via the user's Pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/${META_VER}/me/accounts?` +
      new URLSearchParams({
        fields: "name,instagram_business_account,access_token",
        access_token: userToken,
      })
  );
  const pages = await pagesRes.json();
  const page = (pages.data || []).find((p) => p.instagram_business_account);
  if (!page) {
    throw new Error(
      "No Instagram Business/Creator account linked to a Facebook Page was found."
    );
  }
  return {
    platform: "instagram",
    account_id: page.instagram_business_account.id,
    access_token: page.access_token || userToken,
    refresh_token: null,
    expires_at: ll.expires_in
      ? new Date(Date.now() + ll.expires_in * 1000).toISOString()
      : null,
  };
}

// Fetch normalized stats from the official APIs using a stored connection.
// -> { ok, followers, views, engagement, recentPosts } | { ok:false }
export async function fetchViaConnection(conn, periodDays = 28) {
  if (!conn?.access_token) return { ok: false };
  try {
    if (conn.platform === "tiktok") {
      if (conn.api === "business") {
        let c = conn;
        if (isExpired(c) && c.refresh_token) {
          c = await refreshBusiness(c);
          await saveConnection(c);
        }
        return await fetchBusinessStats(c, periodDays);
      }
      return await tiktokStats(conn, periodDays);
    }
    if (conn.platform === "instagram") return await instagramStats(conn, periodDays);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return { ok: false };
}

async function tiktokStats(conn, periodDays) {
  const info = await (
    await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count",
      { headers: { Authorization: `Bearer ${conn.access_token}` } }
    )
  ).json();
  const u = info?.data?.user || {};
  const followers = Number(u.follower_count) || 0;

  const vids = await (
    await fetch("https://open.tiktokapis.com/v2/video/list/?fields=view_count,like_count,comment_count,create_time", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ max_count: 20 }),
    })
  ).json();
  const list = vids?.data?.videos || [];
  const cutoff = Date.now() - periodDays * 86400000;
  const recent = list.filter((v) => (v.create_time || 0) * 1000 >= cutoff);
  const window = recent.length ? recent : list;
  const views = window.reduce((s, v) => s + (Number(v.view_count) || 0), 0);
  const eng = window.filter((v) => v.like_count || v.comment_count);
  const engagement =
    followers && eng.length
      ? Number(
          (
            (eng.reduce((s, v) => s + (v.like_count || 0) + (v.comment_count || 0), 0) /
              eng.length /
              followers) *
            100
          ).toFixed(1)
        )
      : 0;
  return {
    ok: true,
    source: "oauth",
    followers,
    views,
    engagement,
    postsPerWeek: recent.length ? Number((recent.length / (periodDays / 7)).toFixed(1)) : null,
  };
}

async function instagramStats(conn, periodDays) {
  const id = conn.account_id;
  const prof = await (
    await fetch(
      `https://graph.facebook.com/${META_VER}/${id}?fields=username,followers_count,media_count&access_token=${conn.access_token}`
    )
  ).json();
  const followers = Number(prof.followers_count) || 0;
  const username = prof.username || null;

  // Account-level total views over the window. This is the number Instagram
  // shows in the app's "Views" dashboard (ALL content, including reels that
  // reach non-followers). Summing individual posts badly undercounts, so we
  // prefer this and fall back to the per-media sum only if it's unavailable.
  let views = 0;
  let viewsSource = "media";
  const until = Math.floor(Date.now() / 1000);
  const since = until - periodDays * 86400;
  const igInsight = async (qs) => {
    try {
      const j = await (
        await fetch(
          `https://graph.facebook.com/${META_VER}/${id}/insights?${qs}&access_token=${conn.access_token}`
        )
      ).json();
      if (j.error) {
        console.warn("[ig] views insight error:", j.error?.message);
        return null;
      }
      const row = (j.data || []).find((d) => d.name === "views");
      if (row?.total_value && typeof row.total_value.value === "number") return row.total_value.value;
      if (Array.isArray(row?.values)) return row.values.reduce((s, v) => s + (Number(v.value) || 0), 0);
      return null;
    } catch (e) {
      console.warn("[ig] account views failed:", e?.message);
      return null;
    }
  };
  // Try total_value first, then a time-series sum, over the window.
  let acct = await igInsight(`metric=views&period=day&metric_type=total_value&since=${since}&until=${until}`);
  if (acct == null) acct = await igInsight(`metric=views&period=day&since=${since}&until=${until}`);
  if (acct != null) {
    views = acct;
    viewsSource = "account";
  }

  // Recent media — used for engagement, posts/week, and a views fallback.
  const media = await (
    await fetch(
      `https://graph.facebook.com/${META_VER}/${id}/media?fields=timestamp,like_count,comments_count,media_type,insights.metric(views)&limit=25&access_token=${conn.access_token}`
    )
  ).json();
  const items = media.data || [];
  const cutoff = Date.now() - periodDays * 86400000;
  const recent = items.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= cutoff);
  const window = recent.length ? recent : items;
  if (viewsSource === "media") {
    const viewsOf = (m) => {
      const v = m.insights?.data?.find((x) => x.name === "views");
      return v?.values?.[0]?.value || 0;
    };
    views = window.reduce((s, m) => s + Number(viewsOf(m) || 0), 0);
  }
  const eng = window.filter((m) => m.like_count || m.comments_count);
  const engagement =
    followers && eng.length
      ? Number(
          (
            (eng.reduce((s, m) => s + (m.like_count || 0) + (m.comments_count || 0), 0) /
              eng.length /
              followers) *
            100
          ).toFixed(1)
        )
      : 0;
  return {
    ok: true,
    source: "oauth",
    username,
    followers,
    views,
    engagement,
    postsPerWeek: recent.length ? Number((recent.length / (periodDays / 7)).toFixed(1)) : null,
  };
}
