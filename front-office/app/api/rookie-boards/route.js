import { BOARD_SOURCES, NFL_BOARD_URL, parseDynastyNerds, parseNflmdd } from "@/lib/rookieBoards";

export const maxDuration = 30;

// Re-reads the rookie boards that publish as plain HTML. The mock draft falls back to the snapshot
// in public/data/rookie_boards_<year>.csv for anything that fails here (blocked, page redesigned).
const HOURS = 6;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const PARSERS = { nflmdd: parseNflmdd, dn: parseDynastyNerds };

async function page(url) {
  try {
    const res = await fetch(url, { next: { revalidate: HOURS * 3600 }, headers: { "User-Agent": UA, Accept: "text/html" } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// A redesign that breaks a parser shows up as a short list; ignore those rather than trust them.
const MIN_ROWS = { nflmdd: 50, dn: 12, nfl: 40 };

export async function GET() {
  const live = BOARD_SOURCES.filter((s) => s.live && PARSERS[s.key]);
  const [pages, board] = await Promise.all([Promise.all(live.map((s) => page(s.url))), page(NFL_BOARD_URL)]);
  const lists = {};
  live.forEach((s, i) => {
    const list = pages[i] ? PARSERS[s.key](pages[i]) : [];
    if (list.length >= MIN_ROWS[s.key]) lists[s.key] = list;
  });
  const nfl = board ? parseNflmdd(board) : [];
  return Response.json(
    { fetched: Date.now(), lists, nfl: nfl.length >= MIN_ROWS.nfl ? nfl : [] },
    { headers: { "Cache-Control": `public, s-maxage=${HOURS * 3600}, stale-while-revalidate=86400` } },
  );
}
