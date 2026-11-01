// Outside rookie boards and mocks for the coming class, blended into one consensus for the mock draft.
// The snapshot in public/data/rookie_boards_<year>.csv holds every source; /api/rookie-boards refreshes
// the ones that can be read live (NFL Mock Draft Database daily, plus the newest Dynasty Nerds mock).

// To add a newer article, point the url at it; live sources refresh on their own, snapshot-only
// sources need their column in the CSV updated.
export const BOARD_SOURCES = [
  { key: "nflmdd", label: "NFL Mock Draft DB", sub: "Fantasy rookie rankings · 1QB", sf: false, live: true,
    url: "https://www.nflmockdraftdatabase.com/fantasy-rookie-rankings-2027" },
  { key: "dn", label: "Dynasty Nerds", sub: "1QB rookie mock 3.0", sf: false, live: true, mock: true,
    url: "https://www.dynastynerds.com/mock/2027-1qb-rookie-mock-draft-3-0/" },
  { key: "fbg", label: "Footballguys", sub: "SF big board v4.1 (Kashuba)", sf: true, live: false,
    url: "https://www.footballguys.com/article/2027-dynasty-rookie-rankings-big-board-v41" },
  { key: "dlf", label: "DLF", sub: "SF rookie mock, round 1", sf: true, live: false, mock: true,
    url: "https://dynastyleaguefootball.com/2026/10/16/2027-dynasty-1qb-rookie-mock-draft/" },
];
// The NFL consensus big board: real-draft rank for everyone, and the source of the IDP pool.
export const NFL_BOARD_URL = "https://www.nflmockdraftdatabase.com/big-boards/2027/consensus-big-board-2027";

const ent = (s) =>
  s.replace(/&#39;|&#8217;|&rsquo;/g, "'").replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// NFL Mock Draft Database lists one player per card, in rank order, each linking to /players/<year>/.
export function parseNflmdd(html) {
  const out = [];
  const parts = html.split(/href="\/players\/\d{4}\/[^"]*">/).slice(1);
  for (const chunk of parts) {
    const name = ent(chunk.slice(0, chunk.indexOf("<")));
    const pos = (chunk.match(/>\s*([A-Z]{1,4})\s*<\/span>/) || [])[1];
    const school = (chunk.match(/text-sm text-gray-500[^"]*">\s*([^<\s][^<]*)</) || chunk.match(/\/colleges\/[^"]*">\s*([^<\s][^<]*)</) || [])[1];
    const bb = (chunk.match(/BB #(\d+)/) || [])[1];
    if (name && pos) out.push({ rank: out.length + 1, name, pos, school: school ? ent(school) : "", bb: bb ? Number(bb) : null });
  }
  return out;
}

// Dynasty Nerds mocks are a table: pick | player | pos | school | drafter.
export function parseDynastyNerds(html) {
  const out = [];
  const re = /<tr><td>(\d+)\.(\d+)<\/td><td>([^<]+)<\/td><td>([A-Z]{1,3})<\/td><td>([^<]*)<\/td>/g;
  let m;
  while ((m = re.exec(html))) {
    out.push({ rank: out.length + 1, name: ent(m[3]).replace(/\s*"[^"]*"\s*/, " "), pos: m[4], school: ent(m[5]) });
  }
  return out;
}

// Nicknames some boards use in place of the given name.
const ALIAS = { "daylan smothers": "hollywood smothers", "deshaun bishop": "desean bishop" };
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b\.?/g;
// Name key that survives "Mark Fletcher" vs "Mark Fletcher Jr." and "C.J." vs "CJ".
export const boardKey = (name) => {
  const k = String(name || "").toLowerCase().replace(/[.'’]/g, "").replace(/"[^"]*"/g, "").replace(SUFFIX, "").replace(/[^a-z]+/g, " ").trim();
  return ALIAS[k] || k;
};

// Merge snapshot rows with live lists: a live list replaces that source's column, and the live NFL
// big board replaces the snapshot's NFL rank. Deep names from the long NFL Mock Draft DB list only
// join the pool if they rank inside DEEP_CUTOFF.
// Returns [{ key, name, pos, school, nfl, ranks: { source: rank } }].
const DEEP_CUTOFF = 150;
export function mergeBoards(snapshot, live = {}, nflBoard = []) {
  const byKey = {};
  const row = (name, pos, school) => {
    const k = boardKey(name);
    if (!byKey[k]) byKey[k] = { key: k, name, pos, school, nfl: null, ranks: {} };
    return byKey[k];
  };
  for (const r of snapshot) {
    if (!r.Player) continue;
    const x = row(r.Player, r.Position, r.School || "");
    x.nfl = Number(r["NFL Board"]) || null;
    for (const s of BOARD_SOURCES) if (!live[s.key]?.length && Number(r[s.key])) x.ranks[s.key] = Number(r[s.key]);
  }
  for (const [key, list] of Object.entries(live)) {
    for (const p of list || []) {
      if (!byKey[boardKey(p.name)] && p.rank > DEEP_CUTOFF) continue;
      const x = row(p.name, p.pos, p.school);
      x.ranks[key] = p.rank;
      if (p.bb) x.nfl = p.bb;
    }
  }
  for (const p of nflBoard) if (byKey[boardKey(p.name)]) byKey[boardKey(p.name)].nfl = p.rank;
  return Object.values(byKey);
}

// One consensus order for the format. Sources built for the format count fully; the other format
// counts half, and never for QBs, whose value swings the most between 1QB and superflex.
// A player missing from a short list is assumed to rank below everyone on it.
export function boardConsensus(rows, sf) {
  const len = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.ranks)) len[k] = Math.max(len[k] || 0, v);
  const scored = rows.map((r) => {
    const present = Object.values(r.ranks);
    if (!present.length) return { ...r, score: Infinity };
    const own = present.reduce((a, b) => a + b, 0) / present.length;
    let sum = 0;
    let w = 0;
    for (const s of BOARD_SOURCES) {
      if (!len[s.key]) continue;
      const weight = s.sf === sf ? 1 : r.pos === "QB" ? 0 : 0.5;
      if (!weight) continue;
      const rank = r.ranks[s.key] ?? Math.max(len[s.key] + 1, own);
      sum += rank * weight;
      w += weight;
    }
    return { ...r, score: w ? sum / w : own };
  });
  return scored
    .filter((r) => r.score < Infinity)
    .sort((a, b) => a.score - b.score)
    .map((r, i) => ({ ...r, cons: i + 1 }));
}
