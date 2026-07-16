// Optional Supabase persistence for stat snapshots + history.
// If SUPABASE_URL / SUPABASE_SERVICE_KEY aren't set (or the package isn't
// installed), everything degrades gracefully and the frontend falls back to
// localStorage. Suggested table:
//
//   create table stats_snapshots (
//     id bigint generated always as identity primary key,
//     data jsonb not null,
//     source text default 'manual',
//     created_at timestamptz default now()
//   );

let clientPromise = null;

export function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

async function getClient() {
  if (!isConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) =>
        createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      )
      .catch((e) => {
        console.warn("[supabase] client unavailable:", e?.message);
        return null;
      });
  }
  return clientPromise;
}

// Save a snapshot. Returns the saved row or null if persistence is off.
export async function saveSnapshot(data, source = "manual") {
  const c = await getClient();
  if (!c) return null;
  const { data: row, error } = await c
    .from("stats_snapshots")
    .insert({ data, source })
    .select()
    .single();
  if (error) {
    console.warn("[supabase] saveSnapshot error:", error.message);
    return null;
  }
  return row;
}

// Latest snapshot, or null.
export async function latestSnapshot() {
  const c = await getClient();
  if (!c) return null;
  const { data, error } = await c
    .from("stats_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[supabase] latestSnapshot error:", error.message);
    return null;
  }
  return data;
}

// Recent snapshots for a small history/sparkline. Returns [] when off.
export async function recentSnapshots(limit = 30) {
  const c = await getClient();
  if (!c) return [];
  const { data, error } = await c
    .from("stats_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[supabase] recentSnapshots error:", error.message);
    return [];
  }
  return data || [];
}
