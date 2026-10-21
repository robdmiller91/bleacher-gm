import { SLEEPER, errorResponse, getJSON, leagueFrom, safeJSON, getWeekProjections, currentWeekFor } from "@/lib/sleeper";

export const dynamic = "force-dynamic";

// Live scoring for the current week — short cache so scores update during games.
export async function GET(req) {
  try {
    const base = `${SLEEPER}/league/${leagueFrom(req)}`;
    const [league, state, rosters] = await Promise.all([
      getJSON(base),
      safeJSON(`${SLEEPER}/state/nfl`, {}),
      safeJSON(`${base}/rosters`, []),
    ]);
    const season = Number(league.season) || Number(state.season);
    const lastRegWeek = Math.max(1, (Number(league.settings?.playoff_week_start) || 15) - 1);
    const week = currentWeekFor(state, season, lastRegWeek);
    const [matchups, projections] = await Promise.all([
      safeJSON(`${base}/matchups/${week}`, []),
      getWeekProjections(season, week, league.scoring_settings || {}),
    ]);

    const records = {};
    for (const r of rosters) {
      const s = r.settings || {};
      records[r.roster_id] = { wins: s.wins || 0, losses: s.losses || 0, ties: s.ties || 0 };
    }

    return Response.json(
      {
        week,
        seasonType: state.season_type || "off",
        matchups: (Array.isArray(matchups) ? matchups : []).map((m) => ({
          rosterId: Number(m.roster_id),
          matchupId: m.matchup_id ?? null,
          points: Number(m.points) || 0,
          starters: (m.starters || []).map(String),
          playersPoints: m.players_points || {},
        })),
        projections,
        records,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
