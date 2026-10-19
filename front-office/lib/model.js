// Pure functions shared by the server (building league data) and the browser
// (re-ranking teams for trade what-ifs). Ported from the Streamlit app.

export const POSITIONS = ["QB", "RB", "WR", "TE"];
export const FALLBACK_IMG = "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png";

export const POS_VAR = {
  QB: "var(--qb)", RB: "var(--rb)", WR: "var(--wr)", TE: "var(--te)",
  PK: "var(--pk)", K: "var(--k)", DEF: "var(--k)",
};

// Value tiers on FantasyCalc's scale (top players sit around 9-10k).
export const TIERS = [
  { key: "S", min: 8000, color: "#ef4444" },
  { key: "A", min: 6000, color: "#f97316" },
  { key: "B", min: 4500, color: "#f59e0b" },
  { key: "C", min: 3000, color: "#eab308" },
  { key: "D", min: 1500, color: "#84cc16" },
  { key: "E", min: 0, color: "#64748b" },
];
export const tierFor = (value) => TIERS.find((t) => value >= t.min) || TIERS[TIERS.length - 1];

// Rank where 1 = highest value; ties share the best rank (pandas method="min").
export function rankDesc(values) {
  return values.map((v) => 1 + values.filter((x) => x > v).length);
}

export function quantile(arr, q) {
  const s = arr.filter((x) => x != null && !isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// Team totals, positional ranks and contention window — same rules as build_teams().
export function computeTeams(base, players, picks) {
  const list = Object.values(players);
  const rows = base.map((t) => {
    const roster = list.filter((p) => p.owner === t.rosterId);
    const pos = { QB: 0, RB: 0, WR: 0, TE: 0 };
    let playerValue = 0;
    let trend = 0;
    let ageSum = 0;
    let ageN = 0;
    for (const p of roster) {
      playerValue += p.value || 0;
      trend += p.trend || 0;
      if (pos[p.pos] !== undefined) pos[p.pos] += p.value || 0;
      if (p.age) {
        ageSum += p.age;
        ageN += 1;
      }
    }
    const pickValue = picks.filter((k) => k.owner === t.rosterId).reduce((s, k) => s + k.value, 0);
    return {
      ...t,
      ...pos,
      playerValue,
      pickValue,
      totalValue: playerValue + pickValue,
      trend,
      avgAge: ageN ? Math.round((ageSum / ageN) * 10) / 10 : null,
      count: roster.length,
    };
  });

  for (const key of ["QB", "RB", "WR", "TE", "pickValue", "totalValue", "playerValue"]) {
    const r = rankDesc(rows.map((x) => x[key]));
    rows.forEach((x, i) => {
      x[`${key}Rank`] = r[i];
    });
  }

  const medAge = quantile(rows.map((r) => r.avgAge), 0.5);
  const hi = quantile(rows.map((r) => r.playerValue), 0.65);
  const lo = quantile(rows.map((r) => r.playerValue), 0.35);
  const pickHi = quantile(rows.map((r) => r.pickValue), 0.65);
  const pickMed = quantile(rows.map((r) => r.pickValue), 0.5);
  for (const r of rows) {
    if (r.playerValue >= hi && (r.avgAge ?? 0) <= medAge + 0.4) r.window = "Contender";
    else if (r.playerValue >= hi) r.window = "Win-now";
    else if (r.playerValue <= lo && r.pickValue >= pickHi) r.window = "Rebuilding";
    else if ((r.avgAge ?? 99) < medAge && r.pickValue >= pickMed) r.window = "Ascending";
    else r.window = "Balanced";
  }
  return rows.sort((a, b) => a.totalValueRank - b.totalValueRank);
}

export const WINDOW_POS = { Contender: 8, "Win-now": 22, Balanced: 50, Ascending: 66, Rebuilding: 90 };

// Draft pick slot value curve — identical to slot_value_multipliers().
const SLOT_CURVES = { 1: [1.65, 0.55, 1.6], 2: [1.4, 0.7, 1.4], 3: [1.25, 0.8, 1.3] };
export function slotMultipliers(totalSlots, round) {
  const [start, end, power] = SLOT_CURVES[round] || [1.15, 0.85, 1.2];
  if (totalSlots <= 1) return { 1: 1 };
  const raw = {};
  for (let slot = 1; slot <= totalSlots; slot++) {
    const frac = (totalSlots - slot) / (totalSlots - 1);
    raw[slot] = end + (start - end) * frac ** power;
  }
  const mean = Object.values(raw).reduce((a, b) => a + b, 0) / totalSlots;
  const out = {};
  for (const k of Object.keys(raw)) out[k] = raw[k] / mean;
  return out;
}

// Fantasy points for a Sleeper stat line under the league's own scoring rules.
// Sleeper stat keys line up with scoring_settings keys, so it's a dot product.
export function scoreStats(stats, scoring) {
  if (!stats) return null;
  let total = 0;
  let matched = false;
  if (scoring) {
    for (const [k, v] of Object.entries(stats)) {
      const w = scoring[k];
      if (typeof w === "number" && typeof v === "number") {
        total += v * w;
        matched = true;
      }
    }
  }
  if (matched) return total;
  const fallback = stats.pts_ppr ?? stats.pts_half_ppr ?? stats.pts_std;
  return typeof fallback === "number" ? fallback : null;
}

function erf(x) {
  // Abramowitz-Stegun approximation, plenty accurate for win probabilities.
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

export function winProb(meanA, meanB, sdA = 25, sdB = 25) {
  const sd = Math.sqrt(sdA * sdA + sdB * sdB);
  if (!sd) return meanA === meanB ? 0.5 : meanA > meanB ? 1 : 0;
  return 0.5 * (1 + erf((meanA - meanB) / sd / Math.SQRT2));
}

function gauss(mean, sd) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Monte Carlo playoff odds over the real remaining schedule. Our own model,
// not a licensed odds product — directional only.
export function simulatePlayoffOdds({ teams, weekly, currentWeek, playoffWeekStart, playoffTeams, trials = 2000 }) {
  const done = weekly.filter((w) => w.week < currentWeek && w.points > 0);
  const n = teams.length;
  const strength = {};
  for (const t of teams) {
    const pts = done.filter((w) => w.rosterId === t.rosterId).map((w) => w.points);
    const prior = 100 + 20 * (n > 1 ? 1 - (t.totalValueRank - 1) / (n - 1) : 0.5);
    if (pts.length) {
      const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
      const sd = pts.length > 2 ? Math.sqrt(pts.reduce((a, b) => a + (b - mean) ** 2, 0) / (pts.length - 1)) : 25;
      const w = Math.min(pts.length / 6, 1);
      strength[t.rosterId] = { mean: w * mean + (1 - w) * prior, sd: Math.max(sd, 12) };
    } else {
      strength[t.rosterId] = { mean: prior, sd: 25 };
    }
  }

  const pairs = [];
  const byKey = {};
  for (const w of weekly) {
    if (w.week < currentWeek || w.week >= playoffWeekStart || w.matchupId == null) continue;
    const key = `${w.week}-${w.matchupId}`;
    (byKey[key] = byKey[key] || []).push(w.rosterId);
  }
  for (const v of Object.values(byKey)) if (v.length === 2) pairs.push(v);

  const made = Object.fromEntries(teams.map((t) => [t.rosterId, 0]));
  for (let i = 0; i < trials; i++) {
    const wins = Object.fromEntries(teams.map((t) => [t.rosterId, t.wins]));
    const pf = Object.fromEntries(teams.map((t) => [t.rosterId, t.fpts]));
    for (const [a, b] of pairs) {
      const sa = gauss(strength[a]?.mean ?? 100, strength[a]?.sd ?? 25);
      const sb = gauss(strength[b]?.mean ?? 100, strength[b]?.sd ?? 25);
      pf[a] += sa;
      pf[b] += sb;
      if (sa >= sb) wins[a] += 1;
      else wins[b] += 1;
    }
    const ranked = teams.map((t) => t.rosterId).sort((x, y) => wins[y] - wins[x] || pf[y] - pf[x]);
    for (const rid of ranked.slice(0, playoffTeams)) made[rid] += 1;
  }
  const out = {};
  for (const k of Object.keys(made)) out[k] = (made[k] / trials) * 100;
  return out;
}

// Age curves from the Streamlit app's POSITION_AGE_CURVES.
export const AGE_CURVES = {
  QB: { peak: 29, decline: 33 },
  RB: { peak: 24, decline: 27 },
  WR: { peak: 26, decline: 30 },
  TE: { peak: 27, decline: 31 },
};

export const fmt = (n, digits = 0) =>
  n == null || Number.isNaN(n)
    ? "—"
    : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function ordinal(n) {
  if (n == null) return "—";
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}

export const teamLogo = (abbr) =>
  abbr && abbr !== "FA" ? `https://sleepercdn.com/images/team_logos/nfl/${abbr.toLowerCase()}.png` : FALLBACK_IMG;

export function heightLabel(h) {
  const n = Number(h);
  if (!n) return h || "—";
  return `${Math.floor(n / 12)}'${n % 12}"`;
}
