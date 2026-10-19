import { buildLeague } from "@/lib/sleeper";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cached at Vercel's edge for 10 minutes, served stale while refreshing.
export async function GET() {
  try {
    const data = await buildLeague();
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
