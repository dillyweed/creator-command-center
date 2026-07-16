import { useEffect, useState } from "react";
import {
  loadStats,
  saveStats,
  fmt,
  fmtMoney,
  totalViews,
  totalFollowers,
} from "../lib/stats.js";
import {
  getStats,
  getStatsStatus,
  putStats,
  refreshStats,
  analyzeStats,
} from "../lib/api.js";
import Sources from "../components/Sources.jsx";
import { BOTS } from "../data/bots.js";
import { loadActivity, lastByBot, timeAgo } from "../lib/activity.js";

const PLATFORM_FIELDS = [
  { k: "views", label: "Total views", icon: "ti-eye" },
  { k: "followers", label: "Followers", icon: "ti-users" },
  { k: "engagement", label: "Engagement rate", icon: "ti-heart" },
  { k: "posts", label: "Posts per week", icon: "ti-calendar" },
];

function displayValue(key, val) {
  if (key === "engagement") return `${val || 0}%`;
  if (key === "posts") return `${val || 0}/wk`;
  return fmt(val);
}

function MetricCard({ label, value, sub, children }) {
  return (
    <div className="rounded-[10px] border border-bd bg-s2 p-4 px-[18px]">
      <div className="mb-2 text-[10px] uppercase tracking-[0.1em] text-tm">
        {label}
      </div>
      {children ?? (
        <>
          <div className="text-[26px] font-semibold leading-none text-tp">
            {value}
          </div>
          <div className="mt-1.5 text-[11px] text-tm">{sub}</div>
        </>
      )}
    </div>
  );
}

function PlatformCard({ icon, name, handle, data, editing, onChange }) {
  return (
    <div className="flex-1 rounded-[10px] border border-bd bg-s2 p-5">
      <div className="mb-3.5 flex items-center gap-2 border-b border-bd pb-3.5">
        <i className={`ti ${icon} text-[19px] text-accent`} aria-hidden="true" />
        <span className="text-[14px] font-semibold text-tp">{name}</span>
        {handle && <span className="text-[11px] text-tm">{handle}</span>}
      </div>
      {PLATFORM_FIELDS.map((f) => (
        <div key={f.k} className="mb-2.5 flex items-center justify-between last:mb-0">
          <div className="flex items-center gap-1.5 text-[12px] text-ts">
            <i className={`ti ${f.icon} text-[13px] text-tm`} aria-hidden="true" />
            {f.label}
          </div>
          {editing ? (
            <input
              type="number"
              value={data[f.k]}
              placeholder="0"
              onChange={(e) => onChange(f.k, e.target.value)}
              className="w-[90px] rounded-md border border-accent/25 bg-accent/[0.06] px-2 py-1 text-right text-[13px] text-tp outline-none focus:border-accent"
            />
          ) : (
            <span className="text-[13px] font-medium text-tp">
              {displayValue(f.k, data[f.k])}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(loadStats);
  const [draft, setDraft] = useState(stats);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState({ tiktok: false, instagram: false, supabase: false });
  const [refreshing, setRefreshing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [activity] = useState(loadActivity);
  const recent = lastByBot();
  const [analyzing, setAnalyzing] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // On mount: learn which integrations are live and load persisted stats.
  // Any failure (backend down, etc.) silently keeps the localStorage values.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const st = await getStatsStatus();
        if (alive) setStatus(st);
      } catch {
        /* backend offline - stay on manual */
      }
      try {
        const { persisted, stats: serverStats } = await getStats();
        if (alive && persisted && serverStats) {
          setStats(serverStats);
          saveStats(serverStats);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function startEdit() {
    setDraft(structuredClone(stats));
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
  }
  async function save() {
    setStats(draft);
    saveStats(draft);
    setEditing(false);
    try {
      await putStats(draft); // best-effort server persistence
    } catch {
      /* localStorage already saved */
    }
  }
  function setPlatform(platform, key, value) {
    setDraft((d) => ({ ...d, [platform]: { ...d[platform], [key]: value } }));
  }

  async function refresh() {
    setRefreshing(true);
    setSyncMsg("");
    try {
      const { stats: merged, pulled, configured } = await refreshStats(stats);
      setStats(merged);
      saveStats(merged);
      const got = [
        pulled.tiktok && "TikTok",
        pulled.instagram && "Instagram",
      ].filter(Boolean);
      if (got.length) {
        setSyncMsg(`Synced ${got.join(" + ")} just now`);
      } else if (!configured.tiktok && !configured.instagram) {
        setSyncMsg("No social APIs connected yet — add tokens in the backend .env");
      } else {
        setSyncMsg("Connected, but no new data returned");
      }
    } catch (e) {
      setSyncMsg("Couldn't reach the stats API (is the backend running?)");
    } finally {
      setRefreshing(false);
    }
  }

  async function analyze() {
    setAnalyzing(true);
    setSyncMsg("");
    try {
      const { stats: merged, analysis, sources } = await analyzeStats(stats);
      setStats(merged);
      saveStats(merged);
      setBreakdown({ analysis, sources });
      setShowBreakdown(true);
      setSyncMsg("Analytics filled your stats · views = last 30 days");
    } catch (e) {
      setSyncMsg("Analytics lookup failed (is the backend running with an API key?)");
    } finally {
      setAnalyzing(false);
    }
  }

  const view = editing ? draft : stats;
  const deals = Number(stats.deals) || 0;

  return (
    <>
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-bd bg-s1 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <i
            className="ti ti-layout-dashboard text-[22px] text-accent"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-tp">Dashboard</div>
            <div className="mt-0.5 truncate text-[11px] text-tm">
              {syncMsg || "Your social overview"}
            </div>
          </div>
        </div>
        {editing ? (
          <div className="flex flex-shrink-0 gap-2">
            <button
              onClick={cancelEdit}
              className="rounded-lg border border-bd2 px-3.5 py-1.5 text-[11px] text-ts transition-colors hover:bg-s2 hover:text-tp"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-lg bg-accent px-4 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="flex flex-shrink-0 flex-wrap justify-end gap-2">
            <button
              onClick={analyze}
              disabled={analyzing}
              className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-[11px] text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
            >
              <i
                className={`ti ${analyzing ? "ti-loader-2 animate-spin" : "ti-sparkles"} text-[13px]`}
                aria-hidden="true"
              />
              {analyzing ? "Looking up…" : "Fill with Analytics"}
            </button>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-bd2 px-3.5 py-1.5 text-[11px] text-ts transition-colors hover:bg-s2 hover:text-tp disabled:opacity-60"
            >
              <i
                className={`ti ti-refresh text-[13px] ${refreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {refreshing ? "Syncing…" : "Refresh"}
            </button>
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 rounded-lg border border-bd2 px-3.5 py-1.5 text-[11px] text-ts transition-colors hover:bg-s2 hover:text-tp"
            >
              <i className="ti ti-edit text-[13px]" aria-hidden="true" /> Update stats
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
        {breakdown && (
          <section className="rounded-[10px] border border-accent/25 bg-accent/[0.04]">
            <button
              onClick={() => setShowBreakdown((v) => !v)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <i className="ti ti-sparkles text-[15px] text-accent" aria-hidden="true" />
              <span className="text-[12px] font-medium text-tp">
                Analytics breakdown
              </span>
              <span className="text-[11px] text-tm">how these numbers were found</span>
              <i
                className={`ti ti-chevron-down ml-auto text-[14px] text-tm transition-transform ${
                  showBreakdown ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>
            {showBreakdown && (
              <div className="border-t border-accent/20 px-4 py-3">
                <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-ts">
                  {breakdown.analysis}
                </div>
                <Sources sources={breakdown.sources} />
              </div>
            )}
          </section>
        )}

        {/* Combined totals */}
        <section>
          <div className="mb-2.5 text-[10px] uppercase tracking-[0.12em] text-tm">
            Combined totals
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              label="Total views"
              value={fmt(totalViews(view))}
              sub="TikTok + Instagram"
            />
            <MetricCard
              label="Total followers"
              value={fmt(totalFollowers(view))}
              sub="Combined audience"
            />
            <MetricCard label="Revenue">
              {editing ? (
                <>
                  <input
                    type="number"
                    value={draft.revenue}
                    placeholder="0"
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, revenue: e.target.value }))
                    }
                    className="mt-0.5 w-full border-0 border-b border-accent bg-transparent pb-1 text-[24px] font-semibold text-tp outline-none"
                  />
                  <div className="mt-2.5 flex items-center gap-2">
                    <input
                      type="number"
                      value={draft.deals}
                      placeholder="0"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, deals: e.target.value }))
                      }
                      className="w-[50px] border-0 border-b border-accent/25 bg-transparent pb-0.5 text-[13px] text-tp outline-none"
                    />
                    <span className="text-[11px] text-tm">active deals</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[26px] font-semibold leading-none text-tp">
                    {fmtMoney(stats.revenue)}
                  </div>
                  <div className="mt-1.5 text-[11px] text-tm">
                    {deals} active deal{deals !== 1 ? "s" : ""}
                  </div>
                </>
              )}
            </MetricCard>
          </div>
        </section>

        {/* Platform breakdown */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.12em] text-tm">
              Platform breakdown
            </span>
            <div className="flex items-center gap-3 text-[10px] text-tm">
              <span className="flex items-center gap-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${status.tiktok ? "bg-success" : "bg-bd2"}`}
                />
                TikTok API
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${status.instagram ? "bg-success" : "bg-bd2"}`}
                />
                IG API
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <PlatformCard
              icon="ti-brand-tiktok"
              name="TikTok"
              handle="@dylanwallaceyt"
              data={view.tiktok}
              editing={editing}
              onChange={(k, v) => setPlatform("tiktok", k, v)}
            />
            <PlatformCard
              icon="ti-brand-instagram"
              name="Instagram"
              handle="@dylanwalllace"
              data={view.instagram}
              editing={editing}
              onChange={(k, v) => setPlatform("instagram", k, v)}
            />
          </div>
        </section>

        {/* Bot status */}
        <section>
          <div className="mb-2.5 text-[10px] uppercase tracking-[0.12em] text-tm">
            Bots
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {BOTS.map((b) => {
              const last = recent[b.id];
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-[10px] border border-bd bg-s2 p-4"
                >
                  <i className={`ti ${b.icon} text-[18px] text-accent`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-tp">{b.name}</div>
                    <div className="truncate text-[11px] text-tm">
                      {last ? `Last task ${timeAgo(last.at)}` : "Idle"}
                    </div>
                  </div>
                  <span
                    className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      last ? "bg-success shadow-[0_0_5px_#2ecc71]" : "bg-bd2"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent activity */}
        <section>
          <div className="mb-2.5 text-[10px] uppercase tracking-[0.12em] text-tm">
            Recent activity
          </div>
          <div className="rounded-[10px] border border-bd bg-s2">
            {activity.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-tm">
                No activity yet — talk to a bot to see it here.
              </div>
            ) : (
              activity.slice(0, 6).map((e, i) => {
                const meta = BOTS.find((b) => b.id === e.bot);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b border-bd px-4 py-3 last:border-b-0"
                  >
                    <i
                      className={`ti ${meta?.icon || "ti-robot"} text-[15px] text-tm`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[12px] font-medium text-tp">
                        {e.botName}
                      </span>
                      <span className="ml-2 text-[12px] text-ts">{e.summary}</span>
                    </div>
                    <span className="flex-shrink-0 text-[11px] text-tm">
                      {timeAgo(e.at)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </>
  );
}
