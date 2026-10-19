// Server-only data layer: Sleeper's public API + FantasyCalc dynasty values.
import { computeTeams, scoreStats, slotMultipliers, teamLogo } from "./model";

export const SLEEPER = "https://api.sleeper.app/v1";
export const SLEEPER_WEB = "https://api.sleeper.com";
export const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || "1382737164013436928";
export const MY_TEAM_NAME = process.env.MY_TEAM_NAME || "what up dough";

export async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "front-office" } });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

export async function safeJSON(url, fallback) {
  try {
    const data = await getJSON(url);
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

// /players/nfl is ~5MB and changes slowly, so keep it in memory on warm functions.
let playersCache = null;
let playersAt = 0;
export async function getAllPlayers() {
  if (playersCache && Date.now() - playersAt < 6 * 3600 * 1000) return playersCache;
  playersCache = await getJSON(`${SLEEPER}/players/nfl`);
  playersAt = Date.now();
  return playersCache;
}

export function teamName(user, rosterId) {
  const m = (user && user.metadata) || {};
  return m.team_name || user?.display_name || user?.username || `Roster ${rosterId}`;
}

export function playerImage(id, espnId) {
  return espnId
    ? `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`
    : `https://sleepercdn.com/content/nfl/players/${id}.jpg`;
}

const posQuery = (list) => list.map((p) => `position%5B%5D=${p}`).join("&");

// Bulk stat/projection responses come back either as a list of {player_id, stats}
// or as a dict keyed by player id — handle both.
export function statLinesById(data) {
  const out = {};
  if (Array.isArray(data)) {
    for (const e of data) if (e && e.player_id != null && e.stats) out[String(e.player_id)] = e.stats;
  } else if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) if (v && typeof v === "object") out[k] = v.stats || v;
  }
  return out;
}

export async function getWeekProjections(season, week, scoring) {
  const url = `${SLEEPER_WEB}/projections/nfl/${season}/${week}?season_type=regular&${posQuery(["QB", "RB", "WR", "TE", "K", "DEF"])}`;
  const lines = statLinesById(await safeJSON(url, []));
  const out = {};
  for (const [id, s] of Object.entries(lines)) {
    const pts = scoreStats(s, scoring);
    if (pts != null) out[id] = Math.round(pts * 100) / 100;
  }
  return out;
}

export function currentWeekFor(state, season, lastRegWeek) {
  if (state.season_type === "regular" || state.season_type === "post") return Number(state.week) || 1;
  if (Number(state.season) > season) return lastRegWeek + 1; // league season already finished
  return 1;
}

async function draftedSeasons(drafts, totalTeams) {
  const done = new Set();
  await Promise.all(
    drafts.map(async (d) => {
      const s = Number(d.season);
      if (!s) return;
      if (d.status === "complete") {
        done.add(s);
        return;
      }
      if (!d.draft_id) return;
      // Status strings lag sometimes; a full set of picks also means it's done.
      const picks = await safeJSON(`${SLEEPER}/draft/${d.draft_id}/picks`, []);
      const expected = (Number(d.settings?.rounds) || 0) * totalTeams;
      if (expected && picks.length >= expected) done.add(s);
    }),
  );
  return done;
}

export async function buildLeague() {
  const base = `${SLEEPER}/league/${LEAGUE_ID}`;
  const [league, users, rosters, tradedPicks, drafts, state] = await Promise.all([
    getJSON(base),
    getJSON(`${base}/users`),
    getJSON(`${base}/rosters`),
    safeJSON(`${base}/traded_picks`, []),
    safeJSON(`${base}/drafts`, []),
    safeJSON(`${SLEEPER}/state/nfl`, {}),
  ]);

  const settings = league.settings || {};
  const scoring = league.scoring_settings || {};
  const rosterPositions = league.roster_positions || [];
  const superflex = rosterPositions.includes("SUPER_FLEX");
  const season = Number(league.season) || Number(state.season) || new Date().getFullYear();
  const numTeams = rosters.length || 12;
  const ppr = typeof scoring.rec === "number" ? scoring.rec : 1;
  const playoffWeekStart = Number(settings.playoff_week_start) || 15;
  const lastRegWeek = Math.max(1, playoffWeekStart - 1);

  const fcUrl = `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=${superflex ? 2 : 1}&numTeams=${numTeams}&ppr=${ppr}`;
  const weeks = Array.from({ length: lastRegWeek }, (_, i) => i + 1);
  const [allPlayers, fcRaw, seasonRaw, matchupsByWeek, drafted] = await Promise.all([
    getAllPlayers(),
    safeJSON(fcUrl, []),
    safeJSON(`${SLEEPER_WEB}/stats/nfl/${season}?season_type=regular&${posQuery(["QB", "RB", "WR", "TE"])}`, []),
    Promise.all(weeks.map((w) => safeJSON(`${base}/matchups/${w}`, []))),
    draftedSeasons(drafts, numTeams),
  ]);

  // ---- Teams ----
  const usersById = Object.fromEntries(users.map((u) => [String(u.user_id), u]));
  const teamsBase = rosters.map((r) => {
    const u = usersById[String(r.owner_id)] || {};
    const s = r.settings || {};
    return {
      rosterId: Number(r.roster_id),
      ownerId: String(r.owner_id || ""),
      name: teamName(u, r.roster_id),
      manager: u.display_name || "",
      avatar: u.metadata?.avatar || (u.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null),
      wins: s.wins || 0,
      losses: s.losses || 0,
      ties: s.ties || 0,
      fpts: (s.fpts || 0) + (s.fpts_decimal || 0) / 100,
      fptsAgainst: (s.fpts_against || 0) + (s.fpts_against_decimal || 0) / 100,
    };
  });
  [...teamsBase]
    .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
    .forEach((t, i) => {
      t.standing = i + 1;
    });

  // ---- Players ----
  const fcById = {};
  const fcPicks = {}; // FantasyCalc also prices picks, e.g. "2027 Early 1st", "2027 1st", "2026 Pick 1.04"
  for (const row of Array.isArray(fcRaw) ? fcRaw : []) {
    const pl = row.player || {};
    if (String(pl.position || "").toUpperCase() === "PICK" && pl.name) {
      fcPicks[pl.name.toLowerCase().trim()] = Number(row.value) || 0;
      continue;
    }
    const sid = pl.sleeperId || row.sleeperId;
    if (!sid) continue;
    fcById[String(sid)] = {
      value: Number(row.value) || 0,
      ovrRank: row.overallRank ?? null,
      posRank: row.positionRank ?? null,
      trend: Number(row.trend30Day) || 0,
      age: pl.maybeAge ?? null,
    };
  }
  const seasonLines = statLinesById(seasonRaw);

  const players = {};
  const addPlayer = (id, owner, status) => {
    const p = allPlayers[id] || {};
    const fc = fcById[id] || {};
    const line = seasonLines[id];
    const gp = line?.gp || 0;
    const pts = line ? scoreStats(line, scoring) : null;
    const pos = p.position || (/^[A-Z]{2,3}$/.test(id) ? "DEF" : "NA");
    players[id] = {
      id,
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || id,
      pos,
      team: p.team || (pos === "DEF" ? id : "FA"),
      age: p.age ?? fc.age ?? null,
      value: fc.value || 0,
      ovrRank: fc.ovrRank ?? null,
      posRank: fc.posRank ?? null,
      trend: fc.trend || 0,
      owner,
      status,
      injury: p.injury_status || null,
      injuryPart: p.injury_body_part || null,
      yearsExp: p.years_exp ?? null,
      college: p.college || null,
      number: p.number ?? null,
      height: p.height || null,
      weight: p.weight || null,
      eligible: p.fantasy_positions || [pos],
      img: pos === "DEF" ? teamLogo(id) : playerImage(id, p.espn_id),
      gp,
      seasonPts: pts != null ? Math.round(pts * 10) / 10 : null,
      ppg: gp && pts != null ? Math.round((pts / gp) * 100) / 100 : null,
      snapPct: line && line.tm_off_snp ? Math.round((line.off_snp / line.tm_off_snp) * 1000) / 10 : null,
    };
  };

  const rosterMeta = {};
  for (const r of rosters) {
    const rid = Number(r.roster_id);
    const starters = (r.starters || []).map(String);
    const reserve = new Set((r.reserve || []).map(String));
    const taxi = new Set((r.taxi || []).map(String));
    rosterMeta[rid] = { starters, players: (r.players || []).map(String) };
    for (const raw of r.players || []) {
      const id = String(raw);
      let status = starters.includes(id) ? "Starter" : "Bench";
      if (reserve.has(id)) status = "IR";
      else if (taxi.has(id)) status = "Taxi";
      addPlayer(id, rid, status);
    }
  }
  for (const id of Object.keys(fcById)) if (!players[id] && allPlayers[id]) addPlayer(id, null, "FA");

  // ---- Draft picks (ported from build_picks) ----
  const rosterIds = teamsBase.map((t) => t.rosterId);
  const totalSlots = rosterIds.length || 12;
  const baseRounds = Number(settings.draft_rounds) || 3;
  const tradedSeasons = tradedPicks.map((p) => Number(p.season)).filter(Boolean);
  const maxTradedRound = Math.max(0, ...tradedPicks.map((p) => Number(p.round) || 0));
  const seasons = [...new Set([season, season + 1, season + 2, ...tradedSeasons])].filter((s) => !drafted.has(s));
  let next = (seasons.length ? Math.max(...seasons) : season) + 1;
  while (seasons.length < 3) {
    if (!drafted.has(next)) seasons.push(next);
    next += 1;
  }
  seasons.sort((a, b) => a - b);
  const rounds = Math.max(baseRounds, maxTradedRound);

  const ownership = new Map();
  for (const s of seasons) for (const rid of rosterIds) for (let r = 1; r <= rounds; r++) ownership.set(`${s}|${r}|${rid}`, rid);
  for (const p of tradedPicks) {
    const s = Number(p.season);
    const r = Number(p.round);
    const orig = Number(p.roster_id);
    const owner = Number(p.owner_id);
    if (!s || !r || !orig || !owner || drafted.has(s)) continue;
    ownership.set(`${s}|${r}|${orig}`, owner);
  }

  // Worst record picks first; no games yet = coin flip, broken by points.
  const estimateOrder = [...teamsBase]
    .sort((a, b) => {
      const ga = a.wins + a.losses + a.ties;
      const gb = b.wins + b.losses + b.ties;
      return (ga ? a.wins / ga : 0.5) - (gb ? b.wins / gb : 0.5) || a.fpts - b.fpts;
    })
    .map((t) => t.rosterId);
  const slotOrder = (s) => {
    const d = drafts.find((x) => Number(x.season) === s && x.draft_order && Object.keys(x.draft_order).length);
    const m = {};
    if (d) {
      for (const [uid, slot] of Object.entries(d.draft_order)) {
        const t = teamsBase.find((x) => x.ownerId === String(uid));
        if (t) m[t.rosterId] = Number(slot);
      }
      return { map: m, official: true };
    }
    estimateOrder.forEach((rid, i) => {
      m[rid] = i + 1;
    });
    return { map: m, official: false };
  };
  const orders = Object.fromEntries(seasons.map((s) => [s, slotOrder(s)]));
  const ROUND_BASE = { 1: 4300, 2: 1800, 3: 800, 4: 350, 5: 150 };
  const nameOf = Object.fromEntries(teamsBase.map((t) => [t.rosterId, t.name]));

  const ROUND_WORD = { 1: "1st", 2: "2nd", 3: "3rd" };
  const third = Math.ceil(totalSlots / 3);

  // Prefer FantasyCalc's market price for the pick (same scale as player values),
  // most specific name first; fall back to the round/slot curve model.
  const pickValue = (s, r, slot, official) => {
    const word = ROUND_WORD[r] || `${r}th`;
    const tier = slot ? (slot <= third ? "early" : slot <= third * 2 ? "mid" : "late") : null;
    const mult = slot ? slotMultipliers(totalSlots, r)[slot] || 1 : 1;
    const exact = slot && official ? fcPicks[`${s} pick ${r}.${String(slot).padStart(2, "0")}`] : null;
    if (exact) return { value: exact, source: "FantasyCalc" };
    const tiered = tier ? fcPicks[`${s} ${tier} ${word}`] : null;
    if (tiered) return { value: tiered, source: "FantasyCalc" };
    const generic = fcPicks[`${s} ${word}`];
    if (generic) return { value: Math.round(generic * mult), source: "FantasyCalc" };
    const yearFactor = { 0: 1, 1: 0.88, 2: 0.76 }[s - season] ?? 0.7;
    return { value: Math.round((ROUND_BASE[r] ?? 75) * yearFactor * mult), source: "Model" };
  };

  const picks = [];
  for (const [key, owner] of ownership) {
    const [s, r, orig] = key.split("|").map(Number);
    const order = orders[s] || { map: {}, official: false };
    const slot = order.map[orig] || null;
    const { value, source } = pickValue(s, r, slot, order.official);
    const tier = slot ? (slot <= third ? "Early" : slot <= third * 2 ? "Mid" : "Late") : null;
    picks.push({
      id: `pk-${s}-${r}-${orig}`,
      season: s,
      round: r,
      slot,
      slotLabel: slot ? `${r}.${String(slot).padStart(2, "0")}` : null,
      tier,
      officialSlot: order.official,
      original: orig,
      originalName: nameOf[orig] || `Roster ${orig}`,
      owner,
      traded: owner !== orig,
      value,
      valueSource: source,
      label: `${s} ${ROUND_WORD[r] || `${r}th`}`,
    });
  }
  picks.sort((a, b) => a.season - b.season || a.round - b.round || (a.slot || 99) - (b.slot || 99));

  const teams = computeTeams(teamsBase, players, picks);

  // ---- Weekly scores + full schedule (for charts and playoff odds) ----
  const weekly = [];
  matchupsByWeek.forEach((ms, i) => {
    for (const m of Array.isArray(ms) ? ms : []) {
      weekly.push({
        week: i + 1,
        rosterId: Number(m.roster_id),
        matchupId: m.matchup_id ?? null,
        points: Number(m.points) || 0,
      });
    }
  });
  const currentWeek = currentWeekFor(state, season, lastRegWeek);

  const target = MY_TEAM_NAME.toLowerCase();
  const mine =
    teams.find((t) => t.name.toLowerCase() === target) ||
    teams.find((t) => t.name.toLowerCase().includes(target)) ||
    teams.find((t) => t.manager.toLowerCase() === target);

  return {
    league: {
      id: LEAGUE_ID,
      name: league.name,
      season,
      avatar: league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null,
      rosterPositions,
      scoring,
      superflex,
      ppr,
      tep: scoring.bonus_rec_te || 0,
      numTeams,
      playoffTeams: Number(settings.playoff_teams) || 6,
      playoffWeekStart,
    },
    state: { season: Number(state.season) || season, week: currentWeek, seasonType: state.season_type || "off" },
    me: mine ? mine.rosterId : null,
    teams,
    rosterMeta,
    players,
    picks,
    weekly,
    updatedAt: new Date().toISOString(),
  };
}
