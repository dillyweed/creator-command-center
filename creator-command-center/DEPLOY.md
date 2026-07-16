# Deploy guide (build step 2)

Goal: get a live URL early. Backend on **Railway**, frontend on **Vercel**.
Both deploy straight from a GitHub repo. Do the backend first so you have its
URL when configuring the frontend.

---

## 0. Push to GitHub

From the project root:

    git init
    git add .
    git commit -m "Creator Command Center - skeleton + dashboard"
    git branch -M main
    git remote add origin https://github.com/<you>/creator-command-center.git
    git push -u origin main

`.env` files are gitignored - only `.env.example` is committed. Never commit real keys.

---

## 1. Backend -> Railway

1. railway.app -> New Project -> Deploy from GitHub repo -> pick this repo.
2. Set the service **Root Directory** to `backend`.
3. Railway auto-detects Node (Nixpacks) and runs `npm start` (see `railway.json`).
4. Add environment variables (Variables tab):
   - `ANTHROPIC_API_KEY` = your key
   - `CORS_ORIGIN` = your Vercel URL (add after step 2, e.g. `https://creator-command-center.vercel.app`)
   - `MODEL_SUBBOT` = `claude-sonnet-4-6`  (optional - this is the default)
   - `MODEL_CEO` = `claude-opus-4-8`        (optional - this is the default)
   - `PORT` is provided by Railway automatically - do not set it.
5. Deploy. Under Settings -> Networking, generate a public domain.
6. Confirm it's live: open `https://<your-railway-domain>/api/health` -> should
   return `{ "ok": true, ... , "hasApiKey": true }`.

---

## 2. Frontend -> Vercel

1. vercel.com -> Add New -> Project -> import this repo.
2. Set **Root Directory** to `frontend`. Framework preset: Vite (auto).
   `vercel.json` already sets the build command, output dir, and SPA rewrites
   (so React Router routes like `/bot/ceo` don't 404 on refresh).
3. Add environment variable:
   - `VITE_API_URL` = your Railway backend URL (no trailing slash),
     e.g. `https://<your-railway-domain>`
4. Deploy. You'll get a URL like `https://creator-command-center.vercel.app`.

---

## 3. Close the loop (CORS)

Go back to Railway and set `CORS_ORIGIN` to the exact Vercel URL from step 2,
then redeploy the backend. Now the browser app can call the API.

To allow multiple origins (e.g. a preview URL too), comma-separate them:

    CORS_ORIGIN=https://creator-command-center.vercel.app,https://staging-....vercel.app

---

## Redeploys

Both platforms redeploy automatically on every push to `main`. Push code, and
the live URLs update on their own.

## Env var reference

| Where    | Variable            | Value                                   |
|----------|---------------------|-----------------------------------------|
| Railway  | ANTHROPIC_API_KEY   | your Anthropic key                      |
| Railway  | CORS_ORIGIN         | your Vercel URL(s)                      |
| Railway  | MODEL_SUBBOT        | claude-sonnet-4-6 (optional)            |
| Railway  | MODEL_CEO           | claude-opus-4-8 (optional)              |
| Vercel   | VITE_API_URL        | your Railway URL (no trailing slash)    |
