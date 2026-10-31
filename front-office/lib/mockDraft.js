// Rookie mock draft for the coming class: settings, pick order, rankings and CPU picks.
// Modelled on Sleeper's mock draft room. Everything runs in the browser.

import { slug } from "./prospects";

export const POSITIONS = ["QB", "RB", "WR", "TE"];
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
  { key: "consensus", label: "Consensus", sub: "Rookie mocks" },
  { key: "bgm", label: "BGM Score", sub: "Our model" },
  { key: "nfl", label: "NFL Board", sub: "Draft capital" },
];
// noise is how many spots a CPU will reach past the best player available.
export const CPU_STYLES = [
  { key: "strict", label: "By the book", sub: "Best available", noise: 0 },
  { key: "balanced", label: "Balanced", sub: "Some reaches", noise: 3.5 },
  { key: "chaos", label: "Chaos", sub: "Big reaches", noise: 9 },
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
  limits: { QB: 0, RB: 0, WR: 0, TE: 0 },
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

// The draft pool: the graded class, then the depth list, then anything added by hand.
// Each player gets an ADP for the chosen rankings and scoring.
export function buildPool({ prospects, consensus, depth, custom }, s) {
  const consRank = {};
  for (const r of consensus) if (r.Player) consRank[slug(r.Player)] = Number(r["Consensus Rank"]) || null;
  const list = [];
  const seen = new Set();
  const add = (p) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    list.push(p);
  };
  for (const x of prospects) {
    add({ id: x.id, name: x.name, pos: x.pos, school: x.school, color: x.color, img: x.img, x, cons: consRank[x.id] ?? null, nfl: x.boardRank ?? null, bgm: x.overall });
  }
  depth
    .filter((r) => r.Player && POSITIONS.includes((r.Position || "").toUpperCase()))
    .sort((a, b) => Number(a.Rank) - Number(b.Rank))
    .forEach((r) => add({ id: slug(r.Player), name: r.Player, pos: r.Position.toUpperCase(), school: r.School, cons: null, nfl: null, bgm: null, depth: true }));
  for (const c of custom) add({ id: `c-${slug(c.name)}`, name: c.name, pos: c.pos, school: c.school, cons: null, nfl: null, bgm: null, custom: true });

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
  const mult = (SCORING.find((x) => x.key === s.scoring) || SCORING[0]).mult;
  return base
    .map(({ p }, i) => ({ p, eff: (i + 1) * (mult[p.pos] || 1) }))
    .sort((a, b) => a.eff - b.eff)
    .map(({ p }, i) => ({ ...p, adp: i + 1 }));
}

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
  const stack = { QB: sf ? 2 : 6, RB: 1, WR: 0.8, TE: 4 };
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
    return { name: t?.name || `Roster ${rid}`, avatar: t?.avatar || null };
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
    },
    teams,
    owners,
    claimed: league.me != null && order.includes(league.me) ? [order.indexOf(league.me)] : [],
    official: picks.some((p) => p.officialSlot),
  };
}
