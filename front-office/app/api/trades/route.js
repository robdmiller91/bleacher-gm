import { SLEEPER, errorResponse, getAllPlayers, leagueFrom, safeJSON } from "@/lib/sleeper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Recent dynasty trades from Sleeper, normalized to the same shape:
//   league  - this league's trades this season (team names shown)
//   network - other dynasty leagues your leaguemates (and, if needed, their leaguemates) play in (anonymous)
// (FantasyCalc's public feed is added in the browser; see marketTrades in lib/tradeFinder.js.)
// Each trade: { id, source, date, format: {teams, superflex, ppr, tep}, sides: [{ name?, assets: [...] }] }
// where an asset is { type: "player", id, name, pos } or { type: "pick", season, round }.

const NETWORK_LEAGUES = 40; // cap on other leagues scanned (every week of the season in each)
const SECOND_DEGREE_USERS = 60; // cap on managers looked up one step out

async function cachedJSON(url, seconds, fallback) {
  try {
    const res = await fetch(url, { next: { revalidate: seconds }, headers: { "User-Agent": "bleacher-gm" } });
    return res.ok ? (await res.json()) ?? fallback : fallback;
  } catch {
    return fallback;
  }
}

// Run fn over items with at most `limit` requests in flight (Sleeper asks for < 1000 calls a minute).
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n], n);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const formatOf = (l) => ({
  teams: Number(l.total_rosters) || null,
  superflex: (l.roster_positions || []).includes("SUPER_FLEX"),
  ppr: typeof l.scoring_settings?.rec === "number" ? l.scoring_settings.rec : 1,
  tep: l.scoring_settings?.bonus_rec_te || 0,
});

function sleeperTrades(txLists, { source, format, names, players, leagueId }) {
  const out = [];
  for (const tx of txLists.flat()) {
    if (!tx || tx.type !== "trade" || tx.status !== "complete") continue;
    const sides = new Map((tx.roster_ids || []).map((r) => [Number(r), { name: names?.[Number(r)], assets: [] }]));
    const side = (r) => sides.get(Number(r)) || sides.set(Number(r), { name: names?.[Number(r)], assets: [] }).get(Number(r));
    for (const [pid, to] of Object.entries(tx.adds || {})) {
      const m = players[pid] || {};
      side(to).assets.push({ type: "player", id: String(pid), name: m.full_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || String(pid), pos: m.position || "" });
    }
    for (const pk of tx.draft_picks || []) side(pk.owner_id).assets.push({ type: "pick", season: Number(pk.season), round: Number(pk.round) });
    const list = [...sides.values()].filter((s) => s.assets.length);
    if (list.length < 2) continue;
    out.push({ id: `${source}-${leagueId}-${tx.transaction_id}`, source, date: tx.status_updated || tx.created || 0, format, sides: list });
  }
  return out;
}


export async function GET(req) {
  try {
    const leagueId = leagueFrom(req);
    const [league, users, rosters, state, players] = await Promise.all([
      cachedJSON(`${SLEEPER}/league/${leagueId}`, 600, null),
      cachedJSON(`${SLEEPER}/league/${leagueId}/users`, 3600, []),
      cachedJSON(`${SLEEPER}/league/${leagueId}/rosters`, 600, []),
      safeJSON(`${SLEEPER}/state/nfl`, {}),
      getAllPlayers(),
    ]);
    if (!league) throw Object.assign(new Error("League not found."), { status: 404 });
    const format = formatOf(league);
    const season = Number(league.season);
    const week = Math.max(1, Math.min(18, Number(state.season) === season ? Number(state.week) || 1 : 18));

    // This league: every week of the season so far (week 0 holds offseason moves).
    const names = {};
    const byUser = Object.fromEntries(users.map((u) => [String(u.user_id), u]));
    for (const r of rosters) {
      const u = byUser[String(r.owner_id)] || {};
      names[Number(r.roster_id)] = u.metadata?.team_name || u.display_name || `Team ${r.roster_id}`;
    }
    const weeks = Array.from({ length: week + 1 }, (_, i) => i);
    const ownTx = await pool(weeks, 8, (w) => cachedJSON(`${SLEEPER}/league/${leagueId}/transactions/${w}`, 600, []));
    const own = sleeperTrades(ownTx, { source: "league", format, names, players, leagueId });

    // Other dynasty leagues your leaguemates play in. If that's a small circle, go one step
    // further out (the managers in those leagues). Same QB format first, then closest size.
    const seen = new Set([leagueId]);
    const others = [];
    const collect = (lists) => {
      for (const l of lists.flat()) {
        if (!l || seen.has(String(l.league_id))) continue;
        seen.add(String(l.league_id));
        if (Number(l.settings?.type) !== 2) continue;
        others.push({ id: String(l.league_id), format: formatOf(l) });
      }
    };
    const leaguesOf = (uid) => cachedJSON(`${SLEEPER}/user/${uid}/leagues/nfl/${season}`, 6 * 3600, []);
    const seenUsers = new Set(users.map((u) => String(u.user_id)));
    collect(await pool([...seenUsers], 8, leaguesOf));
    if (others.length < NETWORK_LEAGUES / 2) {
      const members = await pool(others.slice(0, 20), 8, (l) => cachedJSON(`${SLEEPER}/league/${l.id}/users`, 6 * 3600, []));
      const next = members.flat().map((u) => String(u?.user_id || "")).filter((id) => id && !seenUsers.has(id) && seenUsers.add(id)).slice(0, SECOND_DEGREE_USERS);
      collect(await pool(next, 8, leaguesOf));
    }
    const distance = (f) => (f.superflex !== format.superflex ? 100 : 0) + Math.abs((f.teams || 12) - (format.teams || 12));
    others.sort((a, b) => distance(a.format) - distance(b.format));
    const scan = others.slice(0, NETWORK_LEAGUES);
    const jobs = scan.flatMap((l) => weeks.map((w) => ({ l, w })));
    const netTx = await pool(jobs, 12, ({ l, w }) => cachedJSON(`${SLEEPER}/league/${l.id}/transactions/${w}`, 1800, []));
    const byLeague = new Map(scan.map((l) => [l, []]));
    jobs.forEach((j, i) => byLeague.get(j.l).push(netTx[i]));
    const network = scan.flatMap((l) => sleeperTrades(byLeague.get(l), { source: "network", format: l.format, players, leagueId: l.id }));

    // FantasyCalc's feed is fetched by the browser (lib/tradeFinder.js), which it allows directly.
    const trades = [...own, ...network].sort((a, b) => b.date - a.date);
    return Response.json(
      { format, trades, scanned: { own: own.length, network: network.length, leagues: scan.length, weeks: weeks.length } },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
