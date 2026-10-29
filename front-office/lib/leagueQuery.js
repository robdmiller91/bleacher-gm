// Read-only summaries of a Sleeper league (the output of buildLeague) for the Ask tools.

import { POSITIONS, simulatePlayoffOdds } from "./model";

const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function findTeam(data, ref) {
  if (ref == null || ref === "" || String(ref).toLowerCase() === "me") return data.teams.find((t) => t.rosterId === data.me) || null;
  const n = Number(ref);
  if (Number.isInteger(n)) return data.teams.find((t) => t.rosterId === n) || null;
  const q = norm(ref);
  return data.teams.find((t) => norm(t.name) === q || norm(t.manager) === q) || data.teams.find((t) => norm(t.name).includes(q) || norm(t.manager).includes(q)) || null;
}

const teamRow = (data, t, odds) => ({
  rosterId: t.rosterId, team: t.name, manager: t.manager, isYou: t.rosterId === data.me,
  record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`, standing: t.standing, pointsFor: r1(t.fpts), pointsAgainst: r1(t.fptsAgainst),
  playoffOddsPct: odds ? r1(odds[t.rosterId]) : null,
  window: t.window, avgAge: t.avgAge,
  totalValue: Math.round(t.totalValue), totalValueRank: t.totalValueRank, playerValueRank: t.playerValueRank, pickValueRank: t.pickValueRank,
  positionRanks: Object.fromEntries(POSITIONS.map((p) => [p, t[`${p}Rank`]])),
});

export function leagueOverview(data) {
  const L = data.league;
  let odds = null;
  if (data.state?.seasonType === "regular" || data.weekly?.some((w) => w.points > 0)) {
    try {
      odds = simulatePlayoffOdds({
        teams: data.teams, weekly: data.weekly, currentWeek: data.state.week,
        playoffWeekStart: L.playoffWeekStart, playoffTeams: L.playoffTeams, trials: 3000,
      });
    } catch {
      odds = null;
    }
  }
  return {
    league: {
      name: L.name, season: L.season, teams: L.numTeams, playoffTeams: L.playoffTeams, playoffWeekStart: L.playoffWeekStart,
      currentWeek: data.state?.week, superflex: L.superflex, ppr: L.ppr, tePremium: L.tep, rosterPositions: L.rosterPositions,
    },
    yourTeam: data.teams.find((t) => t.rosterId === data.me)?.name || "not set (no team matched the signed-in user)",
    standings: [...data.teams].sort((a, b) => a.standing - b.standing).map((t) => teamRow(data, t, odds)),
    notes: "Values are FantasyCalc dynasty values (higher is better). Ranks: 1 = strongest in the league. Playoff odds come from a Monte Carlo simulation of the remaining schedule; directional only.",
  };
}

export function teamDetail(data, t) {
  const roster = Object.values(data.players).filter((p) => p.owner === t.rosterId);
  const starters = new Set(data.rosterMeta?.[t.rosterId]?.starters || []);
  const byPos = {};
  for (const p of roster.sort((a, b) => b.value - a.value)) {
    (byPos[p.pos] = byPos[p.pos] || []).push({
      id: p.id, name: p.name, nflTeam: p.team, age: p.age ? Math.floor(p.age) : null, value: p.value, posRank: p.posRank ? `${p.pos}${p.posRank}` : null,
      ppg: r1(p.ppg), gamesPlayed: p.gp || 0, injury: p.injury || undefined, starting: starters.has(p.id) || undefined, trend30d: p.trend || 0,
    });
  }
  return {
    ...teamRow(data, t, null),
    positionValues: Object.fromEntries(POSITIONS.map((p) => [p, Math.round(t[p] || 0)])),
    roster: byPos,
    draftPicks: data.picks.filter((k) => k.owner === t.rosterId).map(pickRow),
  };
}

const pickRow = (k) => ({
  pick: k.label, season: k.season, round: k.round,
  slot: k.slotLabel ? `${k.officialSlot ? "" : "projected "}${k.slotLabel}` : "slot not set yet",
  originalOwner: k.originalName, traded: k.traded, value: k.value, valueSource: k.valueSource,
});

export function draftPicks(data, season) {
  const picks = data.picks.filter((k) => !season || k.season === season);
  const owner = Object.fromEntries(data.teams.map((t) => [t.rosterId, t.name]));
  // What each first-round slot is worth, so moving up (or down) can be priced.
  const firstRoundBySlot = {};
  for (const k of picks.filter((x) => x.round === 1 && x.slot)) (firstRoundBySlot[k.season] = firstRoundBySlot[k.season] || {})[k.slotLabel] = k.value;
  return {
    picks: picks.map((k) => ({ ...pickRow(k), owner: owner[k.owner] || `Roster ${k.owner}`, ownerIsYou: k.owner === data.me })),
    firstRoundValueBySlot: firstRoundBySlot,
    notes: "Future slots are projected from current standings (worst record picks first) until the draft order is set. Values are FantasyCalc pick values.",
  };
}

export function leaguePlayers(data, query, limit = 8) {
  const q = norm(query);
  const owner = Object.fromEntries(data.teams.map((t) => [t.rosterId, t.name]));
  return Object.values(data.players)
    .filter((p) => q && norm(p.name).includes(q))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((p) => ({
      id: p.id, name: p.name, pos: p.pos, nflTeam: p.team, age: p.age ? Math.floor(p.age) : null, value: p.value,
      posRank: p.posRank ? `${p.pos}${p.posRank}` : null, overallRank: p.ovrRank, ppg: r1(p.ppg), trend30d: p.trend || 0,
      owner: p.owner ? owner[p.owner] : "Free agent", ownerIsYou: p.owner === data.me,
    }));
}

// Plain-text snapshot of the league (plus the top of the prospect class) to paste into Claude.
export function leagueSummaryText(data, { prospects = [], prospectClass, question } = {}) {
  const o = leagueOverview(data);
  const L = o.league;
  const me = findTeam(data, "me");
  const out = [];
  if (question) out.push(`My question: ${question}`, "");
  out.push(
    `Below is a snapshot of my dynasty fantasy football league from my Bleacher GM site (Sleeper league data, FantasyCalc dynasty values: higher is better; ranks: 1 = strongest). Use it to answer my question${question ? "" : "s"}.`,
    "",
    `## League: ${L.name} (${L.season}, week ${L.currentWeek ?? "?"})`,
    `${L.teams} teams, ${L.playoffTeams} make the playoffs (from week ${L.playoffWeekStart}). ${L.superflex ? "Superflex" : "1QB"}, ${L.ppr} PPR${L.tePremium ? `, TE premium +${L.tePremium}` : ""}. Starters: ${(L.rosterPositions || []).filter((p) => p !== "BN").join(", ")}.`,
    `My team: ${o.yourTeam}`,
    "",
    "## Standings",
    "Rank | Team | Record | PF | PA | Playoff odds | Window | Avg age | Value rank | QB/RB/WR/TE/Picks ranks",
  );
  for (const t of o.standings) {
    const pr = t.positionRanks;
    out.push(
      `${t.standing} | ${t.team}${t.isYou ? " (me)" : ""} | ${t.record} | ${t.pointsFor ?? "-"} | ${t.pointsAgainst ?? "-"} | ${t.playoffOddsPct != null ? `${t.playoffOddsPct}%` : "-"} | ${t.window || "-"} | ${t.avgAge ?? "-"} | ${t.totalValueRank} | ${pr.QB}/${pr.RB}/${pr.WR}/${pr.TE}/${t.pickValueRank}`,
    );
  }
  if (me) {
    const d = teamDetail(data, me);
    out.push("", `## My roster (${me.name})`);
    const order = [...POSITIONS, ...Object.keys(d.roster).filter((p) => !POSITIONS.includes(p))];
    for (const [pos, list] of order.filter((p) => d.roster[p]).map((p) => [p, d.roster[p]])) {
      out.push(`${pos}: ${list.map((p) => `${p.name} (${[p.nflTeam, p.age && `age ${p.age}`, `value ${p.value}`, p.posRank, p.ppg != null && `${p.ppg} ppg`, p.injury, p.starting && "starter"].filter(Boolean).join(", ")})`).join("; ")}`);
    }
    out.push(`My picks: ${d.draftPicks.map((k) => `${k.pick} (${k.slot}${k.traded ? `, via ${k.originalOwner}` : ""}, value ${k.value})`).join("; ") || "none"}`);
  }
  const dp = draftPicks(data);
  const slots = Object.entries(dp.firstRoundValueBySlot);
  if (slots.length) {
    out.push("", "## First-round pick value by slot");
    for (const [season, bySlot] of slots) out.push(`${season}: ${Object.entries(bySlot).map(([s, v]) => `${s} = ${v}`).join(", ")}`);
    out.push("(Future slots are projected from current standings, worst record first.)");
  }
  const top = prospects.filter((x) => x.draftYear === prospectClass).sort((a, b) => b.z - a.z).slice(0, 24);
  if (top.length) {
    out.push("", `## Top ${prospectClass} rookie prospects (BGM Prospect Score)`);
    top.forEach((x, i) => out.push(`${i + 1}. ${x.name}, ${x.pos}, ${x.school}: ${x.tier.label}, overall ${x.overall.toFixed(1)}`));
  }
  return out.join("\n");
}
