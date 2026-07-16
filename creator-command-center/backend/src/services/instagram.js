// Instagram stats via the Instagram Graph API (graph.facebook.com).
// Requires IG_ACCESS_TOKEN + IG_USER_ID (a Business/Creator account linked to a
// Facebook Page). Returns partials for anything the token can't reach.
//
// Account: @dylanwalllace

const VERSION = process.env.IG_API_VERSION || "v20.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

export function isConfigured() {
  return Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID);
}

async function ig(path, params = {}) {
  const url = new URL(`${BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("access_token", process.env.IG_ACCESS_TOKEN);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram API ${res.status}`);
  return res.json();
}

// -> { views, followers, engagement } or partials.
export async function fetchInstagramStats() {
  if (!isConfigured()) return { configured: false };

  const id = process.env.IG_USER_ID;

  // Profile: followers + media count.
  const profile = await ig(id, { fields: "followers_count,media_count" });
  const followers = Number(profile.followers_count) || 0;

  // Account-level views (last 30d) via insights. Metric availability varies by
  // account type/age; treat failures as "no data" and keep the manual number.
  let views = 0;
  try {
    const insights = await ig(`${id}/insights`, {
      metric: "views",
      period: "day",
      metric_type: "total_value",
    });
    const val = insights?.data?.[0]?.total_value?.value;
    if (typeof val === "number") views = val;
  } catch (e) {
    console.warn("[instagram] views insight unavailable:", e?.message);
  }

  // Engagement (last 30d reach vs interactions) is also insights-gated; left
  // at 0 by default so the creator's manual figure is preserved when absent.
  const engagement = 0;

  return { configured: true, views, followers, engagement };
}
