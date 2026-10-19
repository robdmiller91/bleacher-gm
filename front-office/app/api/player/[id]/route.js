import { LEAGUE_ID, SLEEPER, SLEEPER_WEB, getJSON, safeJSON } from "@/lib/sleeper";
import { scoreStats } from "@/lib/model";

export const dynamic = "force-dynamic";

const KEEP = [
  "gp", "off_snp", "tm_off_snp",
  "pass_att", "pass_cmp", "pass_yd", "pass_td", "pass_int",
  "rush_att", "rush_yd", "rush_td",
  "rec_tgt", "rec", "rec_yd", "rec_td", "fum_lost",
];

// Sleeper returns weekly data keyed by week number (sometimes as a list).
function byWeek(data) {
  const out = {};
  if (Array.isArray(data)) {
    for (const e of data) if (e && e.week != null) out[Number(e.week)] = e;
  } else if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) if (v && typeof v === "object") out[Number(k)] = v;
  }
  return out;
}

const trim = (s) => (s ? Object.fromEntries(KEEP.filter((k) => s[k] != null).map((k) => [k, s[k]])) : null);

export async function GET(req, { params }) {
  try {
    const id = encodeURIComponent(params.id);
    const league = await getJSON(`${SLEEPER}/league/${LEAGUE_ID}`);
    const scoring = league.scoring_settings || {};
    const url = new URL(req.url);
    const season = Number(url.searchParams.get("season")) || Number(league.season);
    const q = `season_type=regular&season=${season}&grouping=week`;
    const [statsRaw, projRaw] = await Promise.all([
      safeJSON(`${SLEEPER_WEB}/stats/nfl/player/${id}?${q}`, {}),
      safeJSON(`${SLEEPER_WEB}/projections/nfl/player/${id}?${q}`, {}),
    ]);
    const stats = byWeek(statsRaw);
    const proj = byWeek(projRaw);

    const weeks = [];
    for (let w = 1; w <= 18; w++) {
      const s = stats[w];
      const p = proj[w];
      const line = s?.stats || null;
      const projLine = p?.stats || null;
      const played = !!(line && (line.gp || line.off_snp || line.pass_att || line.rush_att || line.rec_tgt));
      const pts = played ? scoreStats(line, scoring) : null;
      const projPts = projLine ? scoreStats(projLine, scoring) : null;
      weeks.push({
        week: w,
        opp: s?.opponent || p?.opponent || null,
        team: s?.team || p?.team || null,
        played,
        stats: played ? trim(line) : null,
        pts: pts != null ? Math.round(pts * 100) / 100 : null,
        proj: projPts != null ? Math.round(projPts * 100) / 100 : null,
      });
    }
    const anyOpp = weeks.some((w) => w.opp);
    for (const w of weeks) w.bye = anyOpp && !w.opp && !w.played && w.proj == null;

    return Response.json(
      { id: params.id, season, weeks },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } },
    );
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
