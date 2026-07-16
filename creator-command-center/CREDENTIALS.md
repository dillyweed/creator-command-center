# API credentials checklist

Everything below is optional — the app runs on manual stat entry without it.
Add each value to `backend/.env` (see `.env.example`). All three are server-side
only; never put them in the frontend.

---

## 1. TikTok (Display API) — account @dylanwallaceyt

Powers TikTok followers, total views, and the engagement proxy.

- [ ] Go to developers.tiktok.com and log in with the TikTok account.
- [ ] **Manage apps → Connect an app** (create one). Note the Client Key / Client Secret.
- [ ] Under the app's **Products**, add **Login Kit** and **Display API**.
- [ ] Under **Scopes**, add: `user.info.basic`, `user.info.stats`, `video.list`.
      - `user.info.basic` → profile identity
      - `user.info.stats` → **follower_count, likes_count, video_count** (required for the follower/engagement numbers — this is a separate scope from basic)
      - `video.list` → per-video `view_count` (summed into total views)
- [ ] Add a **Redirect URI** for the OAuth login (any URL you control).
- [ ] Run the Login Kit OAuth flow once as @dylanwallaceyt to authorize, then
      exchange the returned code for an **access token** (+ refresh token).
- [ ] Put the access token in `.env` as `TIKTOK_ACCESS_TOKEN`.

Notes:
- The Display API only reads the **authenticating user's own** account — perfect
  here since it's Dylan's channel.
- Access tokens are short-lived; use the **refresh token** to renew. (A future
  enhancement can auto-refresh server-side.)
- An unaudited app works for the developer's own account/sandbox; you generally
  don't need full app review just to read your own stats.

---

## 2. Instagram (Graph API) — account @dylanwalllace

Powers Instagram followers (and views/engagement where insights allow).

- [ ] Convert @dylanwalllace to a **Business or Creator** account (personal is
      unsupported since the Basic Display API shutdown, Dec 2024).
- [ ] **Link it to a Facebook Page** (required by the Graph API).
- [ ] At developers.facebook.com, create a **Meta Developer account**, then
      **Create App → Business** use case. Note the App ID / App Secret.
- [ ] Add the **Instagram Graph API** product to the app.
- [ ] In the **Graph API Explorer**, generate a user token with:
      `instagram_basic`, `pages_show_list`, `pages_read_engagement`,
      and `instagram_manage_insights` (needed for views/engagement metrics).
- [ ] Find your **IG user id**: `GET /me/accounts` → the Page → `instagram_business_account`.
- [ ] Exchange the short-lived token for a **long-lived token** (~60 days).
- [ ] Put values in `.env`: `IG_ACCESS_TOKEN`, `IG_USER_ID`
      (`IG_API_VERSION` defaults to v20.0).

Notes:
- Long-lived tokens last ~60 days and can be refreshed after 24h — plan to renew.
- Follower/demographic metrics are **hidden for accounts under 100 followers**,
  and insights can lag up to ~48h.
- While the app is in **Development mode**, tokens work for admins/testers
  (i.e. you) without full app review.

---

## 3. Supabase — stats history + persistence

Optional. Without it, stats persist in the browser (localStorage) only.

- [ ] Create a project at supabase.com.
- [ ] **Project Settings → API**: copy the **Project URL** and the
      **`service_role`** key (Legacy API Keys tab if you see the new key UI).
- [ ] Put them in `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
- [ ] In the **SQL editor**, create the table:

```sql
create table stats_snapshots (
  id bigint generated always as identity primary key,
  data jsonb not null,
  source text default 'manual',
  created_at timestamptz default now()
);
```

Notes:
- The `service_role` key bypasses Row Level Security and has full admin access —
  keep it **server-side only** (it lives in the backend `.env`, never the frontend).
- `@supabase/supabase-js` is already in the backend dependencies.

---

## Where each value goes (`backend/.env`)

| Variable              | From                                   |
|-----------------------|----------------------------------------|
| `TIKTOK_ACCESS_TOKEN` | TikTok Login Kit OAuth                 |
| `IG_ACCESS_TOKEN`     | Meta Graph API (long-lived token)      |
| `IG_USER_ID`          | Meta Graph API (`instagram_business_account`) |
| `SUPABASE_URL`        | Supabase → Settings → API              |
| `SUPABASE_SERVICE_KEY`| Supabase → Settings → API (service_role) |

Once set, restart the backend and hit **Refresh** on the dashboard — the API
status dots turn green for whatever you've connected.
