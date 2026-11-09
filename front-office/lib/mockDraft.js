// Rookie mock draft for the coming class: settings, pick order, rankings and CPU picks.
// Modelled on Sleeper's mock draft room. Everything runs in the browser.

import { computeTeams, prospectValue } from "./model";
import { espnHeadshot, schoolColor, slug } from "./prospects";
import { boardConsensus, boardKey } from "./rookieBoards";

export const POSITIONS = ["QB", "RB", "WR", "TE"];
export const IDP_POSITIONS = ["DL", "LB", "DB"];
export const ALL_POSITIONS = [...POSITIONS, ...IDP_POSITIONS];
export const positionsFor = (s) => (s.idp ? ALL_POSITIONS : POSITIONS);
// Sleeper lists some defenders by their real position; IDP leagues score them as DL, LB or DB.
const POS_ALIAS = { DE: "DL", DT: "DL", NT: "DL", EDGE: "DL", ILB: "LB", OLB: "LB", MLB: "LB", CB: "DB", S: "DB", FS: "DB", SS: "DB" };
export const normPos = (pos) => POS_ALIAS[(pos || "").toUpperCase()] || (pos || "").toUpperCase();
export const TEAM_COUNTS = [4, 6, 8, 10, 12, 14, 16];
// Rookie drafts run three rounds at most.
export const MAX_ROUNDS = 3;
export const ROUND_COUNTS = [1, 2, 3];
export const TIMERS = [
  { s: 0, a: "No", b: "Limit" },
  { s: 10, a: "10", b: "Seconds" },
  { s: 30, a: "30", b: "Seconds" },
  { s: 60, a: "60", b: "Seconds" },
  { s: 90, a: "1.5", b: "Minutes" },
  { s: 120, a: "2", b: "Minutes" },
  { s: 180, a: "3", b: "Minutes" },
  { s: 300, a: "5", b: "Minutes" },
  { s: 600, a: "10", b: "Minutes" },
];
export const timerLabel = (s) => (s ? (s < 60 ? `${s} Sec` : `${s / 60} Min`) : "No Limit");

// Scoring only moves positions up or down the board: a multiplier on each player's rank.
export const SCORING = [
  { key: "1qb", label: "Dynasty PPR", mult: {} },
  { key: "half", label: "Dynasty Half-PPR", mult: { RB: 0.88, WR: 1.08 } },
  { key: "std", label: "Dynasty Standard", mult: { RB: 0.8, WR: 1.12, TE: 1.15 } },
  { key: "sf", label: "Dynasty Superflex", mult: { QB: 0.4 }, superflex: true },
  { key: "tep", label: "Dynasty TE Premium", mult: { TE: 0.7 } },
  { key: "sftep", label: "Superflex TE Premium", mult: { QB: 0.4, TE: 0.7 }, superflex: true },
];
export const RANKINGS = [
  { key: "consensus", label: "Consensus", sub: "Rookie boards" },
  { key: "bgm", label: "BGM Score", sub: "Our model" },
  { key: "nfl", label: "NFL Board", sub: "Draft capital" },
];
// noise is how many spots a CPU will reach past the best player available.
export const CPU_STYLES = [
  { key: "strict", label: "By the book", sub: "Best available", noise: 0 },
  { key: "balanced", label: "Balanced", sub: "Some reaches", noise: 3.5 },
  { key: "chaos", label: "Chaos", sub: "Big reaches", noise: 9 },
  { key: "smart", label: "Smart", sub: "League history + need", noise: 0 },
];
export const CPU_SPEEDS = [
  { key: "instant", label: "Instant", ms: 120 },
  { key: "fast", label: "Fast", ms: 600 },
  { key: "normal", label: "Normal", ms: 1500 },
  { key: "slow", label: "Slow", ms: 3500 },
];

export const DEFAULT_SETTINGS = {
  name: "",
  type: "snake",
  scoring: "1qb",
  teams: 10,
  rounds: 3,
  timer: 120,
  cpuAutopick: true,
  rankings: "consensus",
  thirdRoundReversal: false,
  alphabetical: false,
  cpuStyle: "balanced",
  cpuSpeed: "normal",
  limits: { QB: 0, RB: 0, WR: 0, TE: 0, DL: 0, LB: 0, DB: 0 },
  idp: false,
};
export const defaultTeams = (n, from = []) => Array.from({ length: n }, (_, i) => from[i] || { name: `Team ${i + 1}`, avatar: null });

// Snake rounds alternate direction; third-round reversal runs round 3 the same way as round 2.
export const isReversed = (s, round) =>
  s.type === "snake" && (s.thirdRoundReversal && round >= 2 ? round === 2 || round % 2 === 1 : round % 2 === 0);

// Every pick in order. A cell is a (round, column) on the board; the column is the team that holds the slot.
export function pickOrder(s) {
  const out = [];
  for (let r = 1; r <= s.rounds; r++) {
    const rev = isReversed(s, r);
    for (let i = 0; i < s.teams; i++) {
      const col = rev ? s.teams - 1 - i : i;
      out.push({ key: `${r}-${col}`, round: r, col, inRound: i + 1, overall: out.length + 1, rev, last: i === s.teams - 1 });
    }
  }
  return out;
}
export const pickLabel = (c) => `${c.round}.${c.inRound}`;

// The draft pool: the graded class, then everyone else on the outside rookie boards, then anything
// added by hand. Each player gets an ADP for the chosen rankings and scoring.
export function buildPool({ prospects, boards = [], idp = [], custom, espnIds = {} }, s) {
  const headshot = (name) => espnHeadshot(espnIds[slug(name)]);
  const scoring = SCORING.find((x) => x.key === s.scoring) || SCORING[0];
  const ranked = boardConsensus(boards, !!scoring.superflex);
  const onBoard = Object.fromEntries(ranked.map((r) => [r.key, r]));
  const list = [];
  const seen = new Set();
  const add = (p) => {
    const k = boardKey(p.name);
    if (seen.has(p.id) || seen.has(k)) return;
    seen.add(p.id);
    seen.add(k);
    list.push(p);
  };
  for (const x of prospects) {
    const b = onBoard[boardKey(x.name)];
    add({ id: x.id, name: x.name, pos: x.pos, school: x.school, color: x.color, img: x.img, x, cons: b?.cons ?? null, nfl: b?.nfl ?? x.boardRank ?? null, bgm: x.overall, ranks: b?.ranks });
  }
  for (const r of ranked) {
    const pos = normPos(r.pos);
    if (POSITIONS.includes(pos)) add({ id: slug(r.name), name: r.name, pos, school: r.school, color: schoolColor(r.school), img: headshot(r.name), cons: r.cons, nfl: r.nfl ?? null, bgm: null, ranks: r.ranks });
  }
  for (const c of custom.filter((c) => POSITIONS.includes(c.pos))) add({ id: `c-${slug(c.name)}`, name: c.name, pos: c.pos, school: c.school, cons: null, nfl: null, bgm: null, custom: true });
  // Defenders have their own list and are slotted into the board below.
  const defenders = [];
  if (s.idp) {
    idp
      .filter((r) => r.Player && IDP_POSITIONS.includes(normPos(r.Position)))
      .sort((a, b) => Number(a.Rank) - Number(b.Rank))
      .forEach((r) => defenders.push({ id: slug(r.Player), name: r.Player, pos: normPos(r.Position), school: r.School, color: schoolColor(r.School), img: headshot(r.Player), cons: null, nfl: Number(r["NFL Board"]) || null, bgm: null }));
    for (const c of custom.filter((c) => IDP_POSITIONS.includes(c.pos))) defenders.push({ id: `c-${slug(c.name)}`, name: c.name, pos: c.pos, school: c.school, cons: null, nfl: null, bgm: null, custom: true });
  }

  // Players without the chosen ranking keep their place behind those who have one.
  const base = list.map((p, i) => ({ p, i }));
  const rankOf = {
    consensus: (p) => p.cons,
    nfl: (p) => p.nfl,
    bgm: (p) => (p.bgm == null ? null : 1000 - p.bgm),
  }[s.rankings] || ((p) => p.cons);
  const fallback = (p) => p.cons ?? (p.nfl != null ? 100 + p.nfl : null);
  base.sort((a, b) => {
    const ra = rankOf(a.p) ?? (fallback(a.p) != null ? 5000 + fallback(a.p) : null);
    const rb = rankOf(b.p) ?? (fallback(b.p) != null ? 5000 + fallback(b.p) : null);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.i - b.i;
  });
  // The superflex boards already price QBs up, so the QB bump only applies to the other rankings.
  const mult = { ...scoring.mult };
  if (scoring.superflex && s.rankings === "consensus") delete mult.QB;
  // The best defender lands around the middle of round 2 in a 12-team draft, then one every ~2.5 spots.
  const idpRows = defenders.filter((p) => !seen.has(p.id)).map((p, i) => ({ p: { ...p, idpRank: i + 1 }, eff: IDP_START + i * IDP_GAP + 0.01 }));
  return base
    .map(({ p }, i) => ({ p, eff: (i + 1) * (mult[p.pos] || 1) }))
    .concat(idpRows)
    .sort((a, b) => a.eff - b.eff)
    .map(({ p }, i) => ({ ...p, adp: i + 1 }));
}

const IDP_START = 16;
const IDP_GAP = 2.5;

const countPos = (players) => players.reduce((c, p) => ((c[p.pos] = (c[p.pos] || 0) + 1), c), {});
const underLimit = (s, counts) => (p) => !s.limits[p.pos] || (counts[p.pos] || 0) < s.limits[p.pos];

// CPU pick: best available by ADP, nudged by roster need and the CPU style's randomness.
export function cpuChoice(available, teamPlayers, s, rand = Math.random) {
  if (!available.length) return null;
  const counts = countPos(teamPlayers);
  const allowed = available.filter(underLimit(s, counts));
  const pool = (allowed.length ? allowed : available).slice(0, 14);
  const style = CPU_STYLES.find((x) => x.key === s.cpuStyle) || CPU_STYLES[1];
  const sf = (SCORING.find((x) => x.key === s.scoring) || SCORING[0]).superflex;
  // Doubling up costs more at the onesie positions.
  const stack = { QB: sf ? 2 : 6, RB: 1, WR: 0.8, TE: 4, DL: 2, LB: 2, DB: 2 };
  let best = pool[0];
  let bestScore = Infinity;
  for (const p of pool) {
    const score = p.adp + (counts[p.pos] || 0) * stack[p.pos] + rand() * style.noise;
    if (score < bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

// Your auto-pick: top of your queue, otherwise the best available within your position limits.
export function autoChoice(queue, available, teamPlayers, s) {
  const counts = countPos(teamPlayers);
  const ok = underLimit(s, counts);
  const byId = new Map(available.map((p) => [p.id, p]));
  for (const id of queue) {
    const p = byId.get(id);
    if (p && ok(p)) return p;
  }
  return available.find(ok) || available[0] || null;
}

// A Sleeper league's real rookie draft: columns are each slot's original team (round 1 order),
// and a traded pick is made by the team that owns it now. Returns null if the league has no picks for the class.
export function leagueSetup(league, season) {
  const picks = (league?.picks || []).filter((p) => p.season === season && p.slot);
  const r1 = picks.filter((p) => p.round === 1).sort((a, b) => a.slot - b.slot);
  if (!r1.length) return null;
  const order = r1.map((p) => p.original);
  const teams = order.map((rid) => {
    const t = league.teams.find((x) => x.rosterId === rid);
    return { name: t?.name || `Roster ${rid}`, avatar: t?.avatar || null, ownerId: t?.ownerId || null, rosterId: rid };
  });
  const owners = {};
  for (const p of picks) {
    const col = order.indexOf(p.original);
    const owner = order.indexOf(p.owner);
    if (col >= 0 && owner >= 0 && p.round <= MAX_ROUNDS && owner !== col) owners[`${p.round}-${col}`] = owner;
  }
  const lg = league.league;
  return {
    settings: {
      name: `${lg.name} ${season} Rookie Draft`,
      teams: order.length,
      rounds: Math.min(MAX_ROUNDS, Math.max(...picks.map((p) => p.round))),
      type: "linear",
      scoring: lg.superflex ? (lg.tep ? "sftep" : "sf") : lg.tep ? "tep" : "1qb",
      idp: (lg.rosterPositions || []).some((p) => IDP_POSITIONS.includes(p) || p === "IDP_FLEX"),
      cpuStyle: "smart",
    },
    teams,
    owners,
    claimed: league.me != null && order.includes(league.me) ? [order.indexOf(league.me)] : [],
    official: picks.some((p) => p.officialSlot),
  };
}

// What each team spent in the mock and what it got, priced like Roster Lab's devy prospects: a rookie
// going Nth in mock ADP is worth the class's Nth-best pick. Defenders aren't priced (FantasyCalc has
// no IDP values), so their picks stay on the books. Also returns the league with the class drafted:
// each priced pick leaves its owner and the player joins the team that made the selection.
export function mockSummary(league, season, { teams, order, picks, ownerOf, byId }) {
  // Boards synced before teams carried their roster id find it through the Sleeper user.
  const rid = (i) => teams[i]?.rosterId ?? league.teams.find((t) => t.ownerId && t.ownerId === teams[i]?.ownerId)?.rosterId ?? null;
  const classPicks = league.picks.filter((k) => k.season === season);
  const prices = classPicks.map((k) => k.value).sort((a, b) => b - a);
  const rows = [];
  for (const c of order) {
    const p = picks[c.key] ? byId.get(picks[c.key].id) : null;
    if (!p) continue;
    const pick = classPicks.find((k) => k.round === c.round && k.original === rid(c.col));
    const priced = !!pick && POSITIONS.includes(p.pos);
    rows.push({ cell: c, p, team: rid(ownerOf(c)), pick, cost: priced ? pick.value : null, value: priced ? prospectValue(p.adp, prices) : null });
  }
  const players = { ...league.players };
  const used = new Set();
  for (const r of rows) {
    if (r.value == null || r.team == null) continue;
    used.add(r.pick.id);
    const id = `mock-${r.p.id}`;
    players[id] = { id, name: r.p.name, pos: r.p.pos, value: r.value, owner: r.team, age: r.p.x?.ageToday ?? null, eligible: [r.p.pos], trend: 0, status: "Bench" };
  }
  const after = league.picks.filter((k) => !used.has(k.id));
  return { rows, players, picks: after, teams: computeTeams(league.teams, players, after) };
}

// ---------------------------------------------------------------------------
// Smart mock: how this league actually drafts, from its past rookie drafts.

const RECENCY = 0.75; // each older season counts 75% as much as the one after it
const OWNER_PRIOR = 6; // picks of league-average behaviour blended into every manager's record
const share = (counts, keys, total) => Object.fromEntries(keys.map((k) => [k, ((counts[k] || 0) + 0.5) / (total + 0.5 * keys.length)]));

// League-wide position shares, when each position goes (by round), and each manager's lean.
// Managers are tracked by Sleeper user, so a team keeps its history through name changes.
export function draftProfile(history, s) {
  const keys = positionsFor(s);
  const drafts = (history?.drafts || []).filter((d) => d.rounds < 10 && d.picks?.length);
  if (!drafts.length) return null;
  const newest = Math.max(...drafts.map((d) => d.season));
  const all = {};
  const byRound = {};
  const owners = {};
  let total = 0;
  for (const d of drafts) {
    const w = RECENCY ** (newest - d.season);
    for (const p of d.picks) {
      const pos = normPos(p.pos);
      if (!keys.includes(pos) || p.round > MAX_ROUNDS) continue;
      all[pos] = (all[pos] || 0) + w;
      total += w;
      const r = (byRound[p.round] = byRound[p.round] || { n: 0 });
      r[pos] = (r[pos] || 0) + w;
      r.n += w;
      if (!p.ownerId) continue;
      const o = (owners[p.ownerId] = owners[p.ownerId] || { n: 0, raw: 0, counts: {}, recent: [] });
      o.counts[pos] = (o.counts[pos] || 0) + w;
      o.n += w;
      o.raw += 1;
      o.recent.push({ season: d.season, round: p.round, pick: p.pickNo, name: p.name, pos });
    }
  }
  const leagueShare = share(all, keys, total);
  const timing = {};
  for (const [r, c] of Object.entries(byRound)) {
    const rs = share(c, keys, c.n);
    timing[r] = Object.fromEntries(keys.map((k) => [k, rs[k] / leagueShare[k]]));
  }
  for (const o of Object.values(owners)) {
    o.share = Object.fromEntries(keys.map((k) => [k, ((o.counts[k] || 0) + OWNER_PRIOR * leagueShare[k]) / (o.n + OWNER_PRIOR)]));
    o.lean = Object.fromEntries(keys.map((k) => [k, o.share[k] / leagueShare[k]]));
    o.recent.sort((a, b) => b.season - a.season || a.pick - b.pick);
  }
  return { seasons: [...new Set(drafts.map((d) => d.season))].sort((a, b) => b - a), leagueShare, timing, owners };
}

const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

// Positional need for every team, -1 (stacked) to +1 (empty), keyed by Sleeper user.
// Offense uses the team's dynasty value rank at the position; defenders (no FantasyCalc values)
// use how many healthy defenders the team rosters at the position against the league average.
export function teamNeeds(league) {
  if (!league?.teams?.length) return {};
  const n = league.teams.length;
  const players = Object.values(league.players || {});
  const idpCount = {};
  for (const p of players) {
    const pos = normPos(p.pos);
    if (p.owner == null || !IDP_POSITIONS.includes(pos) || p.status === "IR") continue;
    const c = (idpCount[p.owner] = idpCount[p.owner] || {});
    c[pos] = (c[pos] || 0) + 1;
  }
  const avg = Object.fromEntries(IDP_POSITIONS.map((pos) => [pos, league.teams.reduce((s, t) => s + (idpCount[t.rosterId]?.[pos] || 0), 0) / n]));
  const out = {};
  for (const t of league.teams) {
    const need = {};
    for (const pos of POSITIONS) need[pos] = n > 1 && t[`${pos}Rank`] ? clamp((((t[`${pos}Rank`] - 1) / (n - 1)) * 2 - 1)) : 0;
    for (const pos of IDP_POSITIONS) need[pos] = clamp((avg[pos] - (idpCount[t.rosterId]?.[pos] || 0)) / Math.max(1, avg[pos]));
    out[t.ownerId || `r${t.rosterId}`] = need;
  }
  return out;
}

// Weights for the smart pick, in "board spots": a factor of e (2.7×) in a manager's lean is worth
// LEAN_W / ADP_W spots of reach.
const ADP_W = 0.32;
const TIMING_W = 1.0;
const LEAN_W = 1.2;
const NEED_W = 0.7;
const SMART_TEMP = 0.45;

// One CPU pick the way this manager would make it: best available by ADP, pulled toward the positions
// this league takes in this round, the positions this manager has always favoured, and their needs.
// Returns the player and the reasons that tipped it.
export function smartChoice(available, teamPlayers, s, { profile, owner, need, round }, rand = Math.random) {
  if (!available.length) return null;
  const counts = countPos(teamPlayers);
  const allowed = available.filter(underLimit(s, counts));
  const pool = (allowed.length ? allowed : available).slice(0, 22);
  const sf = (SCORING.find((x) => x.key === s.scoring) || SCORING[0]).superflex;
  const stack = { QB: sf ? 0.6 : 2, RB: 0.3, WR: 0.25, TE: 1.2, DL: 0.8, LB: 0.8, DB: 0.8 };
  const timing = profile?.timing?.[round] || {};
  const lean = profile?.owners?.[owner]?.lean || {};
  let best = null;
  let bestU = -Infinity;
  for (const p of pool) {
    const parts = {
      timing: Math.log(timing[p.pos] || 1) * TIMING_W,
      lean: Math.log(lean[p.pos] || 1) * LEAN_W,
      need: (need?.[p.pos] || 0) * NEED_W,
    };
    const gumbel = -Math.log(-Math.log(Math.min(0.999999, Math.max(1e-6, rand()))));
    const u = -p.adp * ADP_W + parts.timing + parts.lean + parts.need - (counts[p.pos] || 0) * stack[p.pos] + gumbel * SMART_TEMP;
    if (u > bestU) {
      bestU = u;
      best = { p, parts };
    }
  }
  const why = [];
  const o = profile?.owners?.[owner];
  if (best.parts.need >= 0.35) why.push(`need at ${best.p.pos}`);
  if (best.parts.lean >= 0.2 && o) why.push(`drafts ${best.p.pos} often (${Math.round(o.share[best.p.pos] * 100)}% of picks)`);
  if (best.parts.timing >= 0.25) why.push(`${best.p.pos}s go here in this league`);
  return { player: best.p, why };
}

// Plain-English read on a manager's history, for the results panel.
export function leanSummary(profile, owner, keys) {
  const o = profile?.owners?.[owner];
  if (!o) return null;
  const top = keys
    .map((k) => ({ pos: k, share: o.share[k], lean: o.lean[k] }))
    .sort((a, b) => b.share - a.share);
  const idp = keys.filter((k) => IDP_POSITIONS.includes(k)).reduce((s, k) => s + (o.counts[k] || 0), 0) / (o.n || 1);
  return { picks: o.raw, top, idp, recent: o.recent.slice(0, 6) };
}
