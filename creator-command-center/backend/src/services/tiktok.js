// TikTok stats via the TikTok Display API (open.tiktokapis.com).
// Requires TIKTOK_ACCESS_TOKEN (OAuth token with user.info + video.list scopes).
// Returns null values for fields the token can't reach so the caller can keep
// the creator's manual numbers.
//
// Account: @dylanwallaceyt

const BASE = "https://open.tiktokapis.com/v2";

export function isConfigured() {
  return Boolean(process.env.TIKTOK_ACCESS_TOKEN);
}

async function tk(path, params = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`TikTok API ${res.status}`);
  return res.json();
}

// -> { views, followers, engagement } (numbers) or partials.
export async function fetchTikTokStats() {
  if (!isConfigured()) return { configured: false };

  // Profile: follower + likes counts.
  const info = await tk("/user/info/", {
    fields: "follower_count,likes_count,video_count",
  });
  const u = info?.data?.user || {};
  const followers = Number(u.follower_count) || 0;
  const totalLikes = Number(u.likes_count) || 0;

  // Total views = sum of view_count across the creator's videos (paged).
  let views = 0;
  try {
    let cursor;
    for (let page = 0; page < 5; page++) {
      const body = {
        max_count: 20,
        ...(cursor ? { cursor } : {}),
      };
      const res = await fetch(`${BASE}/video/list/?fields=view_count`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) break;
      const j = await res.json();
      for (const v of j?.data?.videos || []) views += Number(v.view_count) || 0;
      if (!j?.data?.has_more) break;
      cursor = j?.data?.cursor;
    }
  } catch (e) {
    console.warn("[tiktok] video list failed:", e?.message);
  }

  // Rough engagement proxy: total likes / followers, as a percentage.
  const engagement = followers
    ? Number(((totalLikes / followers) * 100).toFixed(1))
    : 0;

  return { configured: true, views, followers, engagement };
}
