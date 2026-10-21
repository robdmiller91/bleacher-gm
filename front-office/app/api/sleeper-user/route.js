import { errorResponse, getUserLeagues } from "@/lib/sleeper";

export const dynamic = "force-dynamic";

// Looks up a Sleeper username and lists that user's leagues. Sleeper's API is public and
// read-only, so a username is all it takes; nothing is stored on our side.
export async function GET(req) {
  try {
    const username = (new URL(req.url).searchParams.get("username") || "").trim();
    if (!/^[A-Za-z0-9_]{2,40}$/.test(username)) {
      return Response.json({ error: "Enter a Sleeper username (letters, numbers and underscores)." }, { status: 400 });
    }
    const found = await getUserLeagues(username);
    if (!found) return Response.json({ error: `No Sleeper user called "${username}".` }, { status: 404 });
    return Response.json(found, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch (e) {
    return errorResponse(e);
  }
}
