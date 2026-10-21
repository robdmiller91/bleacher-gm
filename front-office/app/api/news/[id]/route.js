import { safeJSON } from "@/lib/sleeper";

export const dynamic = "force-dynamic";

const SOURCES = { fantasy_pros: "FantasyPros", rotowire: "RotoWire", rotoballer: "RotoBaller" };

// Player news from Sleeper's (undocumented) news feed — the same items the
// Sleeper app shows, sourced from FantasyPros, RotoWire and RotoBaller.
// It isn't part of Sleeper's official API, so failures just return no news.
// Only the headline, source and link are passed on: the write-ups belong to those publishers.
export async function GET(req, { params }) {
  const id = encodeURIComponent(params.id);
  const raw = await safeJSON(`https://api.sleeper.app/players/nfl/${id}/news?limit=10`, []);
  const items = (Array.isArray(raw) ? raw : [])
    .map((n) => {
      const m = n.metadata || {};
      return {
        id: `${n.source}-${n.source_key || m.topic_id || n.published}`,
        source: SOURCES[n.source] || n.source || "News",
        sourceKey: n.source || "",
        published: Number(n.published) || 0,
        title: m.title || "",
        url: m.url || null,
      };
    })
    .filter((n) => n.title)
    .sort((a, b) => b.published - a.published);

  return Response.json(
    { id: params.id, items },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } },
  );
}
