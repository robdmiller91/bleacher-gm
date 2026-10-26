// Read-only lookups over the graded prospects, shaped as small JSON summaries.
// These back the "Ask" tools (app/api/ask) so Claude answers from our numbers, not memory.

import { PROSPECT_CLASS, closestProfiles } from "./prospects";

const round = (v, d = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const norm = (s) => (s || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z0-9]/g, "");

// One line per player for lists.
export function brief(x) {
  return {
    id: x.id, name: x.name, pos: x.pos, school: x.school, class: x.draftYear,
    tier: x.tier.label, grade: round(x.grade), overall: round(x.overall, 1), z: round(x.z),
    posRankInClass: x.posRank,
    draft: x.pick != null ? `Round ${x.draftRound}, pick ${x.pick}` : x.boardRank ? `projected board rank ${x.boardRank}` : "unranked",
    nflOutcome: x.pick != null ? x.outcome.label.text : "not drafted yet",
  };
}

// Everything on the report card, minus the presentation.
export function detail(x) {
  return {
    ...brief(x),
    archetype: x.archetype, build: x.build,
    heightIn: x.height, weightLb: x.weight, forty: x.forty,
    draftAge: round(x.draftAge, 1), ageEstimated: !x.dobKnown,
    breakout: x.breakoutSeason ? { season: x.breakoutSeason, age: round(x.breakoutAge, 1) } : null,
    preDraftScore: round(x.predraft), draftCapitalBoost: round(x.capitalBoost),
    productionProfile: round(x.profile), draftCapital: round(x.capital, 1),
    modelVsHype: x.hype.label,
    grades: x.metrics.map((m) => ({ input: m.label, value: m.value == null ? null : m.fmt(m.value), grade0to10: round(m.grade, 1) })),
    collegeSeasons: x.seasons.map((s) => ({
      season: s.season, school: s.school,
      pass: s.passAtt ? `${s.passCmp}/${s.passAtt}, ${s.passYds} yds, ${s.passTd} TD, ${s.passInt} INT` : undefined,
      rush: s.rushAtt ? `${s.rushAtt} car, ${s.rushYds} yds, ${s.rushTd} TD` : undefined,
      rec: s.rec ? `${s.rec} rec, ${s.recYds} yds, ${s.recTd} TD` : undefined,
    })),
    nfl: x.pick != null ? { bestFinishFirst4Yrs: x.outcome.best4, bestCareerFinish: x.outcome.best, top12Seasons: x.outcome.top12, top24Seasons: x.outcome.top24, seasons: x.outcome.seasons, windowComplete: x.outcome.complete } : undefined,
    notes: x.notes || undefined,
  };
}

// Name lookup that tolerates suffixes, punctuation and partial names.
export function findPlayers(all, query, { pos, classYear, limit = 8 } = {}) {
  const q = norm(query);
  const pool = all.filter((x) => (!pos || x.pos === pos) && (!classYear || x.draftYear === classYear));
  if (!q) return pool.slice(0, limit);
  const exact = pool.filter((x) => norm(x.name) === q || x.id === query);
  if (exact.length) return exact.slice(0, limit);
  const parts = (query || "").toLowerCase().split(/\s+/).filter(Boolean).map(norm);
  return pool
    .filter((x) => parts.every((p) => norm(x.name).includes(p) || norm(x.school).includes(p)))
    .sort((a, b) => b.z - a.z)
    .slice(0, limit);
}

export function similarTo(all, x, { classYear, limit = 6 } = {}) {
  const pool = all.filter((y) => (classYear === "past" ? y.draftYear !== PROSPECT_CLASS : !classYear || y.draftYear === classYear));
  return closestProfiles(x, pool, limit).map(({ y, d }) => ({ ...brief(y), distance: round(d) }));
}

const SORTS = {
  grade: (x) => x.grade, overall: (x) => x.overall, z: (x) => x.z,
  production: (x) => x.profile, draftCapital: (x) => x.capital, modelOverHype: (x) => x.hype.gap,
};
export function rankPlayers(all, { pos, classYear, tier, sortBy = "grade", limit = 15 } = {}) {
  const key = SORTS[sortBy] ? sortBy : "grade";
  return all
    .filter((x) => (!pos || x.pos === pos) && (!classYear || x.draftYear === classYear) && (!tier || x.tier.key === tier || x.tier.label === tier))
    .sort((a, b) => SORTS[key](b) - SORTS[key](a))
    .slice(0, Math.min(limit, 50))
    .map(brief);
}
