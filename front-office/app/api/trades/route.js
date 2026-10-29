import { SLEEPER, errorResponse, getAllPlayers, leagueFrom, safeJSON } from "@/lib/sleeper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Recent dynasty trades from three places, normalized to the same shape:
//   league  - this league's trades this season (team names shown)
//   network - other dynasty leagues your leaguemates play in, same QB format (anonymous)
//   market  - FantasyCalc's feed of the latest trades in leagues like yours (anonymous)
// Each trade: { id, source, date, format: {teams, superflex, ppr, tep}, sides: [{ name?, assets: [...] }] }
// where an asset is { type: "player", id, name, pos } or { type: "pick", season, round }.

const NETWORK_LEAGUES = 40; // cap on leaguemates' leagues scanned
const NETWORK_WEEKS = 4; // most recent weeks scanned in each

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

function marketTrades(list, format) {
  const asset = (a) => {
    if (a.position === "PICK") {
      const m = /FP_(\d{4})_(\d)/.exec(a.sleeperId || a.mflId || "");
      return m ? { type: "pick", season: Number(m[1]), round: Number(m[2]) } : null;
    }
    return a.sleeperId ? { type: "player", id: String(a.sleeperId), name: a.name, pos: a.position } : null;
  };
  return (Array.isArray(list) ? list : []).map((t) => ({
    id: `market-${t.id}`,
    source: "market",
    date: Date.parse(t.date) || 0,
    format: { teams: t.numTeams, superflex: (t.numSuperflex || 0) > 0 || t.numQbs === 2, ppr: t.ppr, tep: t.tePremium || 0 },
    sides: [t.side1, t.side2].map((s) => ({ assets: (s || []).map(asset).filter(Boolean) })),
  })).filter((t) => t.sides.every((s) => s.assets.length));
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

    // Leaguemates' other dynasty leagues with the same QB format.
    const lists = await pool(users.map((u) => String(u.user_id)), 8, (uid) => cachedJSON(`${SLEEPER}/user/${uid}/leagues/nfl/${season}`, 6 * 3600, []));
    const seen = new Set([leagueId]);
    const others = [];
    for (const l of lists.flat()) {
      if (!l || seen.has(String(l.league_id))) continue;
      seen.add(String(l.league_id));
      if (Number(l.settings?.type) !== 2) continue;
      const f = formatOf(l);
      if (f.superflex !== format.superflex) continue;
      others.push({ id: String(l.league_id), format: f });
    }
    // Closest team counts first.
    others.sort((a, b) => Math.abs((a.format.teams || 12) - (format.teams || 12)) - Math.abs((b.format.teams || 12) - (format.teams || 12)));
    const scan = others.slice(0, NETWORK_LEAGUES);
    const recentWeeks = weeks.slice(-NETWORK_WEEKS);
    const jobs = scan.flatMap((l) => recentWeeks.map((w) => ({ l, w })));
    const netTx = await pool(jobs, 10, ({ l, w }) => cachedJSON(`${SLEEPER}/league/${l.id}/transactions/${w}`, 1800, []));
    const network = scan.flatMap((l) =>
      sleeperTrades(jobs.map((j, i) => (j.l === l ? netTx[i] : [])), { source: "network", format: l.format, players, leagueId: l.id }),
    );

    // FantasyCalc's latest trades for this format, across common league sizes.
    const sizes = [...new Set([format.teams || 12, 10, 12, 14])];
    const fc = await Promise.all(
      sizes.map((n) => cachedJSON(`https://api.fantasycalc.com/trades?isDynasty=true&numQbs=${format.superflex ? 2 : 1}&numTeams=${n}&ppr=${format.ppr}`, 900, [])),
    );
    const marketSeen = new Set();
    const market = marketTrades(fc.flat(), format).filter((t) => !marketSeen.has(t.id) && marketSeen.add(t.id));

    const trades = [...own, ...network, ...market].sort((a, b) => b.date - a.date);
    return Response.json(
      { format, trades, scanned: { leagues: scan.length, weeks: recentWeeks.length, market: market.length } },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
