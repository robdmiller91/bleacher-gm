// BGM Prospect Score: our own rookie model for the next NFL draft class.
// Each prospect is graded 0-10 on box-score production, age and size (the
// "profile"), blended with projected draft capital from a public big board, and
// matched to how often past picks at that position and round became fantasy
// starters. Every threshold below is a tunable judgement call, not a fitted model.

import { parseCsv } from "./model";

export const PROSPECT_CLASS = 2027;
// Approximate: the 2027 NFL Draft is in late April.
export const DRAFT_DATE = Date.UTC(2027, 3, 24);
const YEAR_MS = 365.25 * 24 * 3600 * 1000;

export const SCHOOL_COLORS = {
  "Ohio State": "#ce1141", Florida: "#0021a5", Indiana: "#990000", Texas: "#bf5700", Oregon: "#007030",
  Missouri: "#c99400", Rutgers: "#cc0033", Alabama: "#9e1b32", "Ole Miss": "#13294b", Georgia: "#ba0c2f",
  "Texas A&M": "#500000", LSU: "#461d7c", Miami: "#005030", Louisville: "#c9001f", "Arizona State": "#8c1d40",
  "Georgia Tech": "#003057", Clemson: "#f56600", "South Carolina": "#73000a", BYU: "#002e5d", "West Virginia": "#002855",
};
export const schoolColor = (school) => SCHOOL_COLORS[school] || "#334155";

// Tiers on the 0-100 overall score.
export const PROSPECT_TIERS = [
  { key: "Franchise", min: 85, color: "#a855f7" },
  { key: "Blue Chip", min: 75, color: "#3b82f6" },
  { key: "Starter Upside", min: 65, color: "#0ea5e9" },
  { key: "Flex Upside", min: 55, color: "#22c55e" },
  { key: "Depth Stash", min: 45, color: "#f59e0b" },
  { key: "Dart Throw", min: 0, color: "#64748b" },
];
export const prospectTier = (overall) => PROSPECT_TIERS.find((t) => overall >= t.min) || PROSPECT_TIERS[PROSPECT_TIERS.length - 1];

const LETTERS = [[9.5, "A+"], [8.5, "A"], [7.5, "A-"], [6.5, "B+"], [5.5, "B"], [4.5, "C+"], [3.5, "C"], [2.5, "C-"], [1.5, "D"], [-1, "F"]];
export const letter = (g) => (g == null ? "—" : LETTERS.find(([min]) => g >= min)[1]);
export const gradeTone = (g) => (g == null ? "var(--muted)" : g >= 7 ? "var(--good)" : g >= 4 ? "var(--pk)" : "var(--bad)");

const num = (v) => (v === "" || v == null ? null : Number(v));
const ratio = (a, b) => (b ? a / b : null);
const avg = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const maxOf = (xs) => {
  const v = xs.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? Math.max(...v) : null;
};

// Linear map onto 0-10; lo/hi can be reversed when lower is better (ages).
function scale(v, lo, hi) {
  if (v == null || Number.isNaN(v)) return null;
  const t = (v - lo) / (hi - lo);
  return Math.round(Math.min(10, Math.max(0, t * 10)) * 10) / 10;
}

export const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const dec = (d) => (v) => (v == null ? "—" : v.toFixed(d));
const inches = (v) => (v == null ? "—" : `${Math.floor(v / 12)}'${v % 12}"`);
const lbs = (v) => (v == null ? "—" : `${v} lb`);

// Per-season shares and rates. Team totals come from the same season and school.
function seasonMetrics(s) {
  const scrimYds = s.rushYds + s.recYds;
  const scrimTd = s.rushTd + s.recTd;
  const teamScrimYds = s.teamRushYds != null && s.teamRecYds != null ? s.teamRushYds + s.teamRecYds : null;
  const teamScrimTd = s.teamRushTd != null && s.teamRecTd != null ? s.teamRushTd + s.teamRecTd : null;
  const recYdShare = ratio(s.recYds, s.teamRecYds);
  const recTdShare = ratio(s.recTd, s.teamRecTd);
  const scrimYdShare = ratio(scrimYds, teamScrimYds);
  const scrimTdShare = ratio(scrimTd, teamScrimTd);
  return {
    ...s,
    scrimYds,
    recDominator: recYdShare == null ? null : avg([recYdShare, recTdShare ?? recYdShare]),
    rbDominator: scrimYdShare == null ? null : avg([scrimYdShare, scrimTdShare ?? scrimYdShare]),
    recShare: recYdShare,
    recPg: ratio(s.recYds, s.games),
    scrimPg: ratio(scrimYds, s.games),
    passPg: ratio(s.passYds, s.games),
    rushPg: ratio(s.rushYds, s.games),
    passShare: s.passAtt >= 50 ? ratio(s.passYds, s.teamRecYds) : null,
    rushShare: ratio(s.rushYds, s.teamRushYds),
    aya: s.passAtt >= 150 ? (s.passYds + 20 * s.passTd - 45 * s.passInt) / s.passAtt : null,
    cmpPct: s.passAtt >= 150 ? s.passCmp / s.passAtt : null,
  };
}

// Breakout = first season whose dominator clears the bar; age is taken on Sept 1 of that season.
const BREAKOUT = { QB: 0.55, RB: 0.2, WR: 0.2, TE: 0.15 };
export const BREAKOUT_LABEL = "QB 55% of team passing yards, RB and WR 20%, TE 15%";
const DOMINATOR_KEY ={ QB: "passShare", RB: "rbDominator", WR: "recDominator", TE: "recDominator" };
export const dominatorOf = (pos, s) => s[DOMINATOR_KEY[pos]];

// The graded inputs per position. `get` reads a value from the prospect's profile;
// [lo, hi] map onto 0-10; `weight` is its share of the position grade.
export const METRICS = {
  QB: [
    { key: "aya", label: "Adj. Yds/Att", get: (x) => maxOf(x.seasons.map((s) => s.aya)), range: [6.5, 10.5], weight: 0.22, fmt: dec(2), note: "Best season's (yards + 20×TD − 45×INT) ÷ attempts, 150+ attempts." },
    { key: "cmp", label: "Completion %", get: (x) => maxOf(x.seasons.map((s) => s.cmpPct)), range: [0.58, 0.72], weight: 0.12, fmt: pct, note: "Best season, 150+ attempts." },
    { key: "passPg", label: "Pass Yds/G", get: (x) => maxOf(x.seasons.map((s) => (s.passAtt >= 150 ? s.passPg : null))), range: [180, 320], weight: 0.14, fmt: dec(1), note: "Best season's passing yards per team game." },
    { key: "breakout", label: "Breakout Age", get: (x) => x.breakoutAge, range: [22.5, 19], weight: 0.14, fmt: dec(1), note: "Age at the first season with 55%+ of the team's passing yards. No breakout scores zero." },
    { key: "rushDom", label: "Rush Dominator", get: (x) => maxOf(x.seasons.map((s) => (s.passAtt >= 150 ? s.rushShare : null))), range: [0, 0.25], weight: 0.12, fmt: pct, note: "Share of team rushing yards in a starting season. Sacks count against college rushing." },
    { key: "attempts", label: "Experience", get: (x) => x.seasons.reduce((s, r) => s + r.passAtt, 0), range: [300, 1100], weight: 0.1, fmt: dec(0), note: "Career pass attempts." },
    { key: "draftAge", label: "Draft Age", get: (x) => x.draftAge, range: [24, 21], weight: 0.16, fmt: dec(1), note: "Age on draft day. Younger is better." },
  ],
  RB: [
    { key: "dominator", label: "Dominator", get: (x) => maxOf(x.seasons.map((s) => s.rbDominator)), range: [0.1, 0.4], weight: 0.24, fmt: pct, note: "Best season's share of team scrimmage yards and touchdowns, averaged." },
    { key: "breakout", label: "Breakout Age", get: (x) => x.breakoutAge, range: [22, 18.5], weight: 0.14, fmt: dec(1), note: "Age at the first season with a 20%+ dominator. No breakout scores zero." },
    { key: "recShare", label: "Receiving Share", get: (x) => maxOf(x.seasons.map((s) => s.recShare)), range: [0.02, 0.15], weight: 0.12, fmt: pct, note: "Best season's share of team receiving yards." },
    { key: "ypc", label: "Yds/Carry", get: (x) => ratio(sum(x.seasons, "rushYds"), sum(x.seasons, "rushAtt")), range: [4.2, 7], weight: 0.1, fmt: dec(2), note: "Career yards per carry." },
    { key: "scrimPg", label: "Scrimmage Yds/G", get: (x) => maxOf(x.seasons.map((s) => s.scrimPg)), range: [40, 150], weight: 0.16, fmt: dec(1), note: "Best season's scrimmage yards per team game." },
    { key: "draftAge", label: "Draft Age", get: (x) => x.draftAge, range: [23.5, 20.5], weight: 0.12, fmt: dec(1), note: "Age on draft day. Younger is better." },
    { key: "size", label: "Size", get: (x) => x.weight, range: [185, 225], weight: 0.06, fmt: lbs, note: "Listed weight." },
    { key: "speed", label: "Speed Score", get: (x) => x.speedScore, range: [85, 115], weight: 0.06, fmt: dec(1), note: "Weight × 200 ÷ 40-time⁴. Only counted once a 40 time is entered." },
  ],
  WR: [
    { key: "dominator", label: "Dominator", get: (x) => maxOf(x.seasons.map((s) => s.recDominator)), range: [0.1, 0.4], weight: 0.18, fmt: pct, note: "Best season's share of team receiving yards and touchdowns, averaged." },
    { key: "breakout", label: "Breakout Age", get: (x) => x.breakoutAge, range: [22, 18.5], weight: 0.2, fmt: dec(1), note: "Age at the first season with a 20%+ dominator. No breakout scores zero." },
    { key: "recPg", label: "Rec Yds/G", get: (x) => maxOf(x.seasons.map((s) => s.recPg)), range: [30, 110], weight: 0.18, fmt: dec(1), note: "Best season's receiving yards per team game." },
    { key: "ypr", label: "Yds/Catch", get: (x) => ratio(sum(x.seasons, "recYds"), sum(x.seasons, "rec")), range: [11, 18], weight: 0.16, fmt: dec(1), note: "Career yards per reception." },
    { key: "draftAge", label: "Draft Age", get: (x) => x.draftAge, range: [23.5, 20.5], weight: 0.18, fmt: dec(1), note: "Age on draft day. Younger is better." },
    { key: "size", label: "Size", get: (x) => x.height, range: [69, 76], weight: 0.04, fmt: inches, note: "Listed height." },
    { key: "speed", label: "Speed Score", get: (x) => x.speedScore, range: [85, 115], weight: 0.06, fmt: dec(1), note: "Weight × 200 ÷ 40-time⁴. Only counted once a 40 time is entered." },
  ],
  TE: [
    { key: "dominator", label: "Dominator", get: (x) => maxOf(x.seasons.map((s) => s.recDominator)), range: [0.06, 0.25], weight: 0.24, fmt: pct, note: "Best season's share of team receiving yards and touchdowns, averaged." },
    { key: "breakout", label: "Breakout Age", get: (x) => x.breakoutAge, range: [22.5, 19], weight: 0.22, fmt: dec(1), note: "Age at the first season with a 15%+ dominator. No breakout scores zero." },
    { key: "recPg", label: "Rec Yds/G", get: (x) => maxOf(x.seasons.map((s) => s.recPg)), range: [15, 70], weight: 0.2, fmt: dec(1), note: "Best season's receiving yards per team game." },
    { key: "ypr", label: "Yds/Catch", get: (x) => ratio(sum(x.seasons, "recYds"), sum(x.seasons, "rec")), range: [9, 15], weight: 0.1, fmt: dec(1), note: "Career yards per reception." },
    { key: "draftAge", label: "Draft Age", get: (x) => x.draftAge, range: [24, 21], weight: 0.14, fmt: dec(1), note: "Age on draft day. Younger is better." },
    { key: "size", label: "Size", get: (x) => x.weight, range: [225, 255], weight: 0.04, fmt: lbs, note: "Listed weight." },
    { key: "speed", label: "Speed Score", get: (x) => x.speedScore, range: [85, 115], weight: 0.06, fmt: dec(1), note: "Weight × 200 ÷ 40-time⁴. Only counted once a 40 time is entered." },
  ],
};

function sum(rows, key) {
  return rows.reduce((s, r) => s + (r[key] || 0), 0);
}

// Share of the overall that comes from the production grade; the rest is draft capital.
// Calibrated on the 2018–22 drafts: for RBs and WRs, where they were drafted predicted
// fantasy hits far better than college box scores did, while QB production held up.
export const PROFILE_SHARE = { QB: 0.6, RB: 0.15, WR: 0.15, TE: 0.3 };
const shareText = (pos) => `${Math.round(PROFILE_SHARE[pos] * 100)}% grade + ${Math.round((1 - PROFILE_SHARE[pos]) * 100)}% draft capital`;
export const BLEND_TEXT = Object.keys(PROFILE_SHARE).map((p) => `${p} ${shareText(p)}`).join(" · ");
export const blendText = shareText;

// Big-board rank → draft capital grade (log scale) and projected round.
export const UNRANKED_RANK = 200;
const CAPITAL_ANCHORS =[[1, 10], [5, 9.6], [16, 8.8], [32, 8], [64, 6.5], [100, 5], [150, 3.5], [260, 1]];
function capitalGrade(rank) {
  if (!rank) return null;
  const x = Math.log(rank);
  for (let i = 1; i < CAPITAL_ANCHORS.length; i++) {
    const [r0, g0] = CAPITAL_ANCHORS[i - 1];
    const [r1, g1] = CAPITAL_ANCHORS[i];
    if (rank <= r1) return Math.round((g0 + ((x - Math.log(r0)) / (Math.log(r1) - Math.log(r0))) * (g1 - g0)) * 10) / 10;
  }
  return 1;
}
export const ROUND_BUCKETS = ["R1", "R2", "R3", "R4-5", "R6-7"];
export const ROUND_LABELS = { R1: "Round 1", R2: "Round 2", R3: "Round 3", "R4-5": "Rounds 4–5", "R6-7": "Rounds 6–7" };
function projectedRound(rank) {
  if (!rank) return null;
  return rank <= 32 ? "R1" : rank <= 64 ? "R2" : rank <= 100 ? "R3" : rank <= 175 ? "R4-5" : "R6-7";
}

function buildLabel(pos, ht, wt) {
  if (pos === "RB") return wt >= 220 ? "Power" : wt <= 195 ? "Scatback" : ht <= 69 ? "Compact" : "Balanced";
  if (pos === "WR") return ht >= 75 && wt >= 210 ? "Big-bodied X" : ht <= 70 ? "Slot" : "Flanker";
  if (pos === "TE") return wt >= 250 ? "In-line" : "Move";
  if (pos === "QB") return ht >= 76 ? "Prototype" : ht <= 73 ? "Undersized" : "Standard";
  return "—";
}

function archetypeLabel(pos, g) {
  const at = (k) => g[k] ?? 0;
  if (pos === "RB") {
    if (at("recShare") >= 7 && at("dominator") >= 7) return "Three-down workhorse";
    if (at("dominator") >= 7) return "Early-down workhorse";
    if (at("recShare") >= 7) return "Receiving back";
    if (at("ypc") >= 8) return "Home-run hitter";
    return "Committee back";
  }
  if (pos === "WR") {
    if (at("dominator") >= 8 && at("breakout") >= 8) return "Alpha";
    if (at("ypr") >= 8) return "Vertical threat";
    if (at("recPg") >= 7) return "Volume target";
    return "Developmental";
  }
  if (pos === "TE") {
    if (at("dominator") >= 7) return "Receiving weapon";
    if (at("ypr") >= 7) return "Seam stretcher";
    return "Developmental";
  }
  if (pos === "QB") {
    if (at("rushDom") >= 6) return "Dual threat";
    if (at("aya") >= 8) return "Efficient passer";
    if (at("attempts") >= 8) return "Seasoned starter";
    return "Developmental";
  }
  return "—";
}

const CLASS_YEAR = ["", "Freshman", "Sophomore", "Junior", "Senior"];
export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function seasonsById(rows) {
  const out = {};
  for (const r of rows) {
    if (!r.Player) continue;
    const id = r["Player Id"] || slug(r.Player);
    (out[id] = out[id] || []).push({
      season: num(r.Season), school: r.School, games: num(r["Team Games"]),
      passCmp: num(r["Pass Cmp"]) || 0, passAtt: num(r["Pass Att"]) || 0, passYds: num(r["Pass Yds"]) || 0,
      passTd: num(r["Pass TD"]) || 0, passInt: num(r["Pass Int"]) || 0,
      rushAtt: num(r["Rush Att"]) || 0, rushYds: num(r["Rush Yds"]) || 0, rushTd: num(r["Rush TD"]) || 0,
      rec: num(r.Rec) || 0, recYds: num(r["Rec Yds"]) || 0, recTd: num(r["Rec TD"]) || 0,
      teamRushYds: num(r["Team Rush Yds"]), teamRushTd: num(r["Team Rush TD"]),
      teamRecYds: num(r["Team Rec Yds"]), teamRecTd: num(r["Team Rec TD"]),
    });
  }
  return out;
}

// One prospect, graded the same way whether he's in the coming class or a past one.
// `capitalRank` is the big-board rank for the coming class and the actual pick for past classes.
function gradeProspect(r, seasonRows, { id, draftYear, capitalRank, now }) {
  const pos = r.Position.toUpperCase();
  const firstSeason = num(r["First Season"]) || seasonRows.reduce((m, s) => Math.min(m, s.season), draftYear - 3);
  // No published birthdate → assume 18.6 years old on Sept 1 of the first college season.
  const dobKnown = !!r.Birthdate;
  const dob = dobKnown ? Date.parse(`${r.Birthdate}T00:00:00Z`) : Date.UTC(firstSeason, 8, 1) - 18.6 * YEAR_MS;
  const ageOn = (t) => (t - dob) / YEAR_MS;
  const height = num(r.Height);
  const weight = num(r.Weight);
  const forty = num(r.Forty);
  const seasons = seasonRows.map(seasonMetrics).sort((a, b) => a.season - b.season);
  const breakout = seasons.find((s) => (dominatorOf(pos, s) ?? 0) >= BREAKOUT[pos]);
  const years = Math.min(draftYear - firstSeason, 4);
  const x = {
    id, name: r.Player, pos, school: r.School, color: SCHOOL_COLORS[r.School] || (r.Color ? `#${r.Color}` : schoolColor(r.School)),
    height, weight, forty, dobKnown, firstSeason, draftYear,
    classYear: CLASS_YEAR[years] || "Senior", classShort: (CLASS_YEAR[years] || "Senior").slice(0, 2).toUpperCase(),
    draftAge: ageOn(draftYear === PROSPECT_CLASS ? DRAFT_DATE : Date.UTC(draftYear, 3, 25)), ageToday: ageOn(now),
    notes: r.Notes || "", seasons,
    breakoutSeason: breakout?.season ?? null,
    breakoutAge: breakout ? ageOn(Date.UTC(breakout.season, 8, 1)) : null,
    speedScore: forty && weight ? (weight * 200) / forty ** 4 : null,
  };

  const grades = {};
  let wsum = 0;
  let gsum = 0;
  x.metrics = METRICS[pos].map((m) => {
    const value = m.get(x);
    let grade = scale(value, m.range[0], m.range[1]);
    if (m.key === "breakout" && value == null && seasons.length) grade = 0;
    if (m.key === "speed" && value == null) grade = null;
    grades[m.key] = grade;
    if (grade != null) {
      wsum += m.weight;
      gsum += m.weight * grade;
    }
    return { ...m, value, grade };
  });
  x.grades = grades;
  x.profile = wsum ? gsum / wsum : 0;
  // Not on the board at all → priced like a late Day 3 pick rather than skipped.
  x.capital = capitalGrade(capitalRank || UNRANKED_RANK);
  x.overall = Math.round((PROFILE_SHARE[pos] * x.profile + (1 - PROFILE_SHARE[pos]) * x.capital) * 100) / 10;
  x.tier = prospectTier(x.overall);
  x.build = buildLabel(pos, height, weight);
  x.archetype = archetypeLabel(pos, grades);
  x.hype = hypeCall(x.profile, x.capital);
  return x;
}

// Model vs. market: our production profile against where the league (or the board) slots him.
export const HYPE_GAP = 1.5;
function hypeCall(profile, capital) {
  const gap = profile - capital;
  if (gap >= HYPE_GAP) return { key: "model", label: "Model > hype", gap };
  if (gap <= -HYPE_GAP) return { key: "hype", label: "Hype > model", gap };
  return { key: "aligned", label: "Aligned", gap };
}

function rankWithin(list) {
  for (const P of Object.keys(METRICS)) {
    const pool = list.filter((x) => x.pos === P);
    const mean = avg(pool.map((x) => x.overall)) || 0;
    const sd = Math.sqrt(avg(pool.map((x) => (x.overall - mean) ** 2)) || 0);
    pool.sort((a, b) => b.overall - a.overall).forEach((x, i) => {
      x.posRank = i + 1;
      x.z = sd ? (x.overall - mean) / sd : 0;
    });
  }
  list.sort((a, b) => b.overall - a.overall || b.profile - a.profile);
  list.forEach((x, i) => {
    x.rank = i + 1;
    x.slot = `${Math.floor(i / 12) + 1}.${String((i % 12) + 1).padStart(2, "0")}`;
  });
  return list;
}

// The coming class: rows from prospects_<year>.csv and prospect_seasons.csv.
export function buildProspects(bioRows, seasonRows, now = Date.now()) {
  const seasonsBy = seasonsById(seasonRows);
  const list = bioRows.filter((r) => r.Player && METRICS[(r.Position || "").toUpperCase()]).map((r) => {
    const id = slug(r.Player);
    const boardRank = num(r["Board Rank"]);
    const x = gradeProspect(r, seasonsBy[id] || [], { id, draftYear: PROSPECT_CLASS, capitalRank: boardRank, now });
    x.boardRank = boardRank;
    x.round = projectedRound(boardRank);
    return x;
  });
  return rankWithin(list);
}

// Past classes: every QB/RB/WR/TE drafted since 2018, graded with the actual pick as draft capital
// and paired with what happened in the NFL.
export function buildHistory(bioRows, seasonRows, now = Date.now()) {
  const seasonsBy = seasonsById(seasonRows);
  const list = bioRows.filter((r) => r.Player && METRICS[(r.Position || "").toUpperCase()]).map((r) => {
    const id = r["Player Id"];
    const pick = num(r.Pick);
    const x = gradeProspect(r, seasonsBy[id] || [], { id, draftYear: num(r["Draft Year"]), capitalRank: pick, now });
    x.pick = pick;
    x.draftRound = num(r.Round);
    x.round = roundBucket(x.draftRound);
    x.outcome = {
      best4: num(r["Best Finish 4yr"]), best: num(r["Best Finish"]),
      top12: num(r["Top 12 Seasons"]) || 0, top24: num(r["Top 24 Seasons"]) || 0,
      seasons: num(r["NFL Seasons"]) || 0, complete: r["Window Complete"] === "1",
    };
    x.outcome.label = outcomeLabel(x.pos, x.outcome);
    return x;
  });
  // Rank, z-score and rookie slot within each draft class, as they'd have looked that spring.
  const byYear = {};
  for (const x of list) (byYear[x.draftYear] = byYear[x.draftYear] || []).push(x);
  Object.values(byYear).forEach(rankWithin);
  return list.sort((a, b) => b.overall - a.overall);
}

// Outcome buckets on the best finish in the first four NFL seasons.
export const OUTCOMES = [
  { key: "elite", label: "Elite (top 12)", max: 12, color: "#16a34a" },
  { key: "starter", label: "Starter (13–24)", max: 24, color: "#84cc16" },
  { key: "flex", label: "Flex (25–36)", max: 36, color: "#eab308" },
  { key: "miss", label: "Miss", max: Infinity, color: "#dc2626" },
];
export const outcomeBucket = (x) => OUTCOMES.find((o) => (x.outcome.best4 ?? Infinity) <= o.max);

// Past prospects with a complete four-year window, grouped into tier × draft round cells.
export function tierRoundGrid(history, pos, maxFinish) {
  const cells = {};
  for (const x of history) {
    if (!x.outcome.complete || (pos !== "ALL" && x.pos !== pos)) continue;
    const key = `${x.tier.key}|${x.draftRound}`;
    const c = (cells[key] = cells[key] || { n: 0, hits: 0 });
    c.n += 1;
    if (x.outcome.best4 != null && x.outcome.best4 <= maxFinish) c.hits += 1;
  }
  return cells;
}

export function outcomeMix(history, pos) {
  const out = {};
  for (const x of history) {
    if (!x.outcome.complete || (pos !== "ALL" && x.pos !== pos)) continue;
    const t = (out[x.tier.key] = out[x.tier.key] || { n: 0, elite: 0, starter: 0, flex: 0, miss: 0 });
    t.n += 1;
    t[outcomeBucket(x).key] += 1;
  }
  return out;
}

const roundBucket = (r) => (r == null ? null : r <= 3 ? `R${r}` : r <= 5 ? "R4-5" : "R6-7");

// Best positional finish in the first four NFL seasons, as "WR1" (top 12), "WR2" (top 24) and so on.
export function outcomeLabel(pos, o) {
  const b = o.best4;
  if (b != null && b <= 36) return { key: b <= 12 ? 1 : b <= 24 ? 2 : 3, text: `${pos}${b <= 12 ? 1 : b <= 24 ? 2 : 3} season` };
  if (!o.complete) return { key: 0, text: "Too early" };
  return { key: 4, text: o.seasons ? `Best ${pos}${b ?? "—"}` : "No NFL stats" };
}

// How past prospects in each of our tiers turned out (complete four-year windows only).
export function tierHitRates(history) {
  const out = {};
  for (const x of history) {
    if (!x.outcome.complete) continue;
    const a = ((out[x.pos] = out[x.pos] || {})[x.tier.key] = out[x.pos]?.[x.tier.key] || { n: 0, top12: 0, top24: 0, top36: 0 });
    a.n += 1;
    const b = x.outcome.best4;
    if (b != null && b <= 12) a.top12 += 1;
    if (b != null && b <= 24) a.top24 += 1;
    if (b != null && b <= 36) a.top36 += 1;
  }
  for (const pos of Object.values(out)) {
    for (const a of Object.values(pos)) for (const k of ["top12", "top24", "top36"]) a[k] = Math.round((a[k] / a.n) * 100);
  }
  return out;
}

// When the model and the draft disagreed, who was right? Top-24 rate by hype call.
export function hypeScorecard(history) {
  const out = {};
  for (const x of history) {
    if (!x.outcome.complete) continue;
    const a = ((out[x.pos] = out[x.pos] || {})[x.hype.key] = out[x.pos]?.[x.hype.key] || { n: 0, hits: 0 });
    a.n += 1;
    if (x.outcome.best4 != null && x.outcome.best4 <= 24) a.hits += 1;
  }
  return out;
}

// Hit rates by position and draft-round bucket.
export function buildHitRates(rows) {
  const out = {};
  for (const r of rows) {
    if (!r.Position) continue;
    (out[r.Position] = out[r.Position] || {})[r.Round] = {
      n: num(r.Players), top12: num(r["Top 12"]), top24: num(r["Top 24"]), top36: num(r["Top 36"]),
    };
  }
  return out;
}

// Closest grade profiles at the same position, by distance across the grades both players have.
export function closestProfiles(x, list, n = 5) {
  return list
    .filter((y) => y.pos === x.pos && y.id !== x.id)
    .map((y) => {
      const keys = Object.keys(x.grades).filter((k) => x.grades[k] != null && y.grades[k] != null);
      const d = keys.length >= 3 ? Math.sqrt(keys.reduce((s, k) => s + (x.grades[k] - y.grades[k]) ** 2, 0) / keys.length) : 99;
      return { y, d };
    })
    .filter((c) => c.d < 99)
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

export async function loadProspectData() {
  const get = (f) => fetch(`/data/${f}`).then((r) => (r.ok ? r.text() : "")).then(parseCsv);
  const [bio, seasons, hits, histBio, histSeasons] = await Promise.all([
    get(`prospects_${PROSPECT_CLASS}.csv`), get("prospect_seasons.csv"), get("prospect_hit_rates.csv"),
    get("prospect_history.csv"), get("prospect_history_seasons.csv"),
  ]);
  const history = buildHistory(histBio, histSeasons);
  return {
    prospects: buildProspects(bio, seasons), hitRates: buildHitRates(hits), history,
    tierHits: tierHitRates(history), hypeCard: hypeScorecard(history),
  };
}
