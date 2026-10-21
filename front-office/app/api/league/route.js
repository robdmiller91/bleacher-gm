import { buildLeague, errorResponse, isSleeperId, leagueFrom } from "@/lib/sleeper";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// /api/league?league=<id>&user=<sleeper user id>. Cached at Vercel's edge for 10 minutes, served stale while refreshing.
export async function GET(req) {
  try {
    const leagueId = leagueFrom(req);
    const user = new URL(req.url).searchParams.get("user");
    const data = await buildLeague(leagueId, isSleeperId(user) ? user : null);
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
