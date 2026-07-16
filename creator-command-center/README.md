# Creator Command Center

A web app dashboard for a short-form content creator. It shows TikTok and Instagram
stats at a glance and runs three AI bots that work together. The **CEO bot** is the
orchestrator: give it a high-level goal and it delegates to the **Research** and
**Analytics** bots, collects their outputs, and synthesizes one unified response.

## Monorepo layout

```
creator-command-center/
├── frontend/    Vite + React + Tailwind (dashboard UI)
└── backend/     Node + Express (Anthropic proxy + CEO orchestration)
```

## The three bots

| Bot        | Role                                                                       |
|------------|----------------------------------------------------------------------------|
| CEO        | Orchestrator. Delegates to Research/Analytics, synthesizes one response.   |
| Research   | Hunts Meta-glasses + degenerate-lifestyle content across the web.          |
| Analytics  | Analyzes the creator's own TikTok (@dylanwallaceyt) / IG (@dylanwalllace). |

> **Research bot uses live web search** (Anthropic's server-side `web_search` tool) so it finds real videos in real time and returns clickable source links. Tune with `WEB_SEARCH_MAX_USES` (default 6).


## Quick start (local)

Two terminals.

**Backend**
    cd backend
    cp .env.example .env      # add your ANTHROPIC_API_KEY
    npm install
    npm run dev               # http://localhost:8787

**Frontend**
    cd frontend
    cp .env.example .env      # VITE_API_URL defaults to http://localhost:8787
    npm install
    npm run dev               # http://localhost:5173

## Build order (all steps complete)

1. Set up project (Vite + React + Tailwind + Node backend)  ✓
2. Deploy config for Vercel + Railway (see DEPLOY.md)  ✓
3. Dashboard home with manual stat entry  ✓
4. Individual bot pages wired to the Anthropic API  ✓
5. CEO bot orchestration logic  ✓
6. Web search on the Research bot  ✓
7. TikTok + Instagram APIs + Supabase for stats  ✓ (add tokens to activate)
8. Activity feed + bot status indicators  ✓
9. Polish, mobile responsiveness, final testing  ✓

## Tech stack

Frontend React (Vite) - Tailwind CSS - Backend Node + Express - DB Supabase (later)
- Hosting Vercel (frontend) + Railway (backend) - AI Anthropic API
(claude-sonnet-4-6 for Research/Analytics, claude-opus-4-8 for CEO orchestration).
