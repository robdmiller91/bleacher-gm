// Draft-class projections for the coming class: weekly score history, NFL draft slot, hit chance
// and how much of the model's input is in. Weekly history is kept in this browser (localStorage):
// each load overwrites the current week's snapshot, so the trend starts the first week you visit.

const KEY = "bgm:prospect-weeks";
const MAX_WEEKS = 26;
const DAY = 24 * 3600 * 1000;

// Weeks start on Sunday (UTC), keyed by date.
export const weekOf = (t = Date.now()) => {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - d.getUTCDay() * DAY).toISOString().slice(0, 10);
};

// Save this week's score and position rank for every prospect; returns all saved weeks.
export function recordWeek(prospects, now = Date.now()) {
  let weeks = {};
  try {
    weeks = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {}
  weeks[weekOf(now)] = Object.fromEntries(prospects.map((x) => [x.id, [Math.round(x.overall), x.posRank]]));
  const keep = Object.keys(weeks).sort().slice(-MAX_WEEKS);
  weeks = Object.fromEntries(keep.map((k) => [k, weeks[k]]));
  try {
    localStorage.setItem(KEY, JSON.stringify(weeks));
  } catch {}
  return weeks;
}

// One prospect's weekly scores, oldest first.
export function scoreHistory(weeks, x) {
  return Object.keys(weeks || {})
    .sort()
    .filter((w) => weeks[w][x.id])
    .map((w) => ({ week: w, score: weeks[w][x.id][0], posRank: weeks[w][x.id][1] }));
}

export const weekLabel = (w) => new Date(`${w}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Big-board rank read as a draft slot. Rounds are taken as 32 picks.
export function draftSlot(rank) {
  if (!rank) return null;
  return { round: Math.ceil(rank / 32), pick: ((rank - 1) % 32) + 1, overall: rank };
}

// Chance of hearing his name called at all, from big-board rank (judgement call, not fitted):
// a logistic centred on pick 224 (the end of round 7). Unranked prospects sit at rank 260.
export function draftedChance(rank) {
  const r = rank || 260;
  return Math.min(99, Math.max(1, Math.round(100 / (1 + Math.exp((r - 224) / 22)))));
}

// Top-12 season chance: past hit rates for his tier and for his projected round, weighted by
// sample size; ± is a 95% interval on the combined sample.
export function hitChance(x, hitRates, tierHits) {
  const parts = [tierHits?.[x.pos]?.[x.tier.key], hitRates?.[x.pos]?.[x.round || "R6-7"]].filter((h) => h?.n);
  const n = parts.reduce((s, h) => s + h.n, 0);
  if (!n) return null;
  const p = parts.reduce((s, h) => s + h.top12 * h.n, 0) / n / 100;
  return { pct: Math.round(p * 100), pm: Math.max(1, Math.round(196 * Math.sqrt((p * (1 - p)) / n))), n };
}

// Share of the grade's inputs we have: every metric plus draft capital (a big-board rank).
export function dataIn(x) {
  const missing = x.metrics.filter((m) => m.grade == null).map((m) => (m.key === "speed" ? "40 time" : m.label));
  if (!x.boardRank) missing.push("big-board rank");
  const total = x.metrics.length + 1;
  return { pct: Math.round(((total - missing.length) / total) * 100), missing };
}

// Movement since the first tracked week. A small score change is "steady".
export function trendOf(history) {
  if (history.length < 2) return { key: "new", label: "Tracking", delta: 0 };
  const first = history[0];
  const last = history[history.length - 1];
  const delta = last.score - first.score;
  const key = delta >= 3 ? "rising" : delta <= -3 ? "falling" : "steady";
  return { key, label: key[0].toUpperCase() + key.slice(1), delta, first, last };
}
