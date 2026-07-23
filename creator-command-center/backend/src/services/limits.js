// Lightweight in-memory rate limiting + Apify spend guard.
//
// Buckets live in process memory, so they reset when the service restarts
// (e.g. on redeploy). That's fine for a single-instance deployment — the
// limits are a cost/abuse guard, not a security boundary. Swap the Maps for
// Supabase or Redis if you scale to multiple instances.
//
// Env knobs (all optional):
//   ANALYZE_DAILY_LIMIT       max /analyze lookups per user per day   (default 5)
//   APIFY_MONTHLY_BUDGET_USD  monthly Apify spend ceiling in dollars  (default 5)
//   APIFY_COST_PER_RUN_USD    estimated cost of one actor run         (default 0.02)

const ANALYZE_DAILY_LIMIT = Math.max(1, Number(process.env.ANALYZE_DAILY_LIMIT) || 5);
const APIFY_MONTHLY_BUDGET_USD = Math.max(0, Number(process.env.APIFY_MONTHLY_BUDGET_USD) || 5);
const APIFY_COST_PER_RUN_USD =
  Number(process.env.APIFY_COST_PER_RUN_USD) > 0
    ? Number(process.env.APIFY_COST_PER_RUN_USD)
    : 0.02;

const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const monthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)

// ---- per-user daily rate limit on /analyze -------------------------------
const analyzeHits = new Map(); // `${who}|${YYYY-MM-DD}` -> count

// Identify the caller. Prefers an explicit client id (header/body) so the same
// browser is tracked across IP changes; falls back to the forwarded IP.
export function clientKey(req) {
  const cid = (req.headers?.["x-client-id"] || req.body?.clientId || "").toString().trim();
  if (cid) return `cid:${cid.slice(0, 80)}`;
  const xff = (req.headers?.["x-forwarded-for"] || "").toString().split(",")[0].trim();
  const ip = xff || req.ip || req.socket?.remoteAddress || "unknown";
  return `ip:${ip}`;
}

function nextUtcMidnight() {
  const n = new Date();
  return new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1)
  ).toISOString();
}

// Check + consume one unit of the caller's daily allowance.
// Returns { ok, limit, used, remaining, resetAt }. Only increments when ok.
export function checkAnalyzeLimit(req) {
  const key = `${clientKey(req)}|${todayKey()}`;
  const used = analyzeHits.get(key) || 0;
  const limit = ANALYZE_DAILY_LIMIT;
  const resetAt = nextUtcMidnight();
  if (used >= limit) {
    return { ok: false, limit, used, remaining: 0, resetAt };
  }
  analyzeHits.set(key, used + 1);
  return { ok: true, limit, used: used + 1, remaining: limit - (used + 1), resetAt };
}

// ---- monthly Apify spend guard -------------------------------------------
const apifyRuns = new Map(); // `${YYYY-MM}` -> run count

export function apifySpend() {
  const runs = apifyRuns.get(monthKey()) || 0;
  const estimatedUsd = Number((runs * APIFY_COST_PER_RUN_USD).toFixed(2));
  return {
    month: monthKey(),
    runs,
    estimatedUsd,
    budgetUsd: APIFY_MONTHLY_BUDGET_USD,
    costPerRunUsd: APIFY_COST_PER_RUN_USD,
    remainingUsd: Number(Math.max(0, APIFY_MONTHLY_BUDGET_USD - estimatedUsd).toFixed(2)),
  };
}

// True while there's still budget for at least one more actor run this month.
export function apifyBudgetOk() {
  const { estimatedUsd } = apifySpend();
  return estimatedUsd + APIFY_COST_PER_RUN_USD <= APIFY_MONTHLY_BUDGET_USD;
}

// Record N actor runs against this month's budget.
export function recordApifyRuns(n = 1) {
  if (n <= 0) return;
  const m = monthKey();
  apifyRuns.set(m, (apifyRuns.get(m) || 0) + n);
}

// Snapshot for a status/usage endpoint.
export function limitsStatus(req) {
  const who = clientKey(req);
  const used = analyzeHits.get(`${who}|${todayKey()}`) || 0;
  return {
    analyze: {
      limit: ANALYZE_DAILY_LIMIT,
      used,
      remaining: Math.max(0, ANALYZE_DAILY_LIMIT - used),
      resetAt: nextUtcMidnight(),
    },
    apify: apifySpend(),
  };
}
