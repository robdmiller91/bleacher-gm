import Anthropic from "@anthropic-ai/sdk";
import { parseCsv } from "@/lib/model";
import { PROSPECT_CLASS, buildAll, buildHitRates, tierHitRates } from "@/lib/prospects";
import { brief, detail, findPlayers, rankPlayers, similarTo } from "@/lib/prospectQuery";
import { draftPicks, findTeam, leagueOverview, leaguePlayers, teamDetail } from "@/lib/leagueQuery";
import { buildLeague, isSleeperId } from "@/lib/sleeper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
const MAX_STEPS = 8;
const MAX_QUESTION = 1000;
const POSITIONS = ["QB", "RB", "WR", "TE"];

// League data is rebuilt from Sleeper at most every 5 minutes per league and user.
const leagueCache = new Map();
async function loadLeague(leagueId, userId) {
  const key = `${leagueId}|${userId || ""}`;
  const hit = leagueCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;
  const data = await buildLeague(leagueId, userId);
  leagueCache.set(key, { at: Date.now(), data });
  if (leagueCache.size > 50) leagueCache.delete(leagueCache.keys().next().value);
  return data;
}

// The prospect files are static assets, so read them the same way the browser does.
let cache = null;
async function loadData(origin) {
  if (cache) return cache;
  const get = async (f) => {
    const res = await fetch(new URL(`/data/${f}`, origin));
    if (!res.ok) throw new Error(`Couldn't load ${f}`);
    return parseCsv(await res.text());
  };
  const [bio, seasons, hits, histBio, histSeasons] = await Promise.all([
    get(`prospects_${PROSPECT_CLASS}.csv`), get("prospect_seasons.csv"), get("prospect_hit_rates.csv"),
    get("prospect_history.csv"), get("prospect_history_seasons.csv"),
  ]);
  const { prospects, history } = buildAll(bio, seasons, histBio, histSeasons);
  cache = { all: [...prospects, ...history], hitRates: buildHitRates(hits), tierHits: tierHitRates(history) };
  return cache;
}

const SYSTEM = `You are the assistant for Bleacher GM, a dynasty fantasy football site. You answer questions about the user's Sleeper league (when one is connected) and about NFL draft prospects scored with the BGM Prospect Score.

The model: each prospect gets 0-10 grades on college inputs (dominator rating, breakout age, yards per game, efficiency, draft age, size, speed score when a 40 time exists), averaged into a production profile. Position grade = production + a draft-capital boost (the big-board rank for the ${PROSPECT_CLASS} class, the actual pick for past classes), usually 8-15. Overall is the grade's percentile at the position (0-100). Z-score puts all positions on one scale and orders each class. Tiers, best to worst: Cornerstone, Elite (Elite+ / Elite / Elite Lite), Elite Upside, Upside, Upside Lite, Outlier, Outlier Lite, Purgatory. "Model vs hype" compares production with draft capital. NFL outcome is the best full-PPR positional finish in a player's first four seasons (WR1 = top 12, WR2 = top 24, WR3 = top 36).

The data covers the ${PROSPECT_CLASS} class (about 30 top prospects, stats through late October 2026) and QBs, RBs, WRs and TEs drafted 2018-2026 with college stats on ESPN. The 2026 class has only part of its rookie NFL season, so its outcomes show as "Too early". PFF charting stats are not in the data.

How to answer:
- Use the tools for every fact about a player. Never rely on memory for grades, stats or outcomes, and never invent players. If someone isn't in the data, say so.
- Look players up with search_players first to get their id, then use the other tools.
- For a comparison, always call compare_players, and for comps call find_similar: the site shows a head-to-head or comp-list card under your answer, so summarise the key differences or names in a few lines instead of repeating every number.
- Be concise: lead with the answer, then the few numbers that support it. Use short lists for comparisons.
- When you name a player from the data, write it as a link: [Player Name](#p:ID) using the id from the tools.
- These are model outputs, not certainties. Say so briefly when a call is close or a sample is small.
- When you name a player from the user's league data, link them as [Player Name](#l:ID) using the league player id.
- Answer only questions about the user's league, these prospects, the model, or dynasty fantasy football strategy (trades, rebuilding vs contending, draft picks). Politely decline anything else.`;

// Added when a league is connected. Kept separate so the long prompt above stays cached.
const leagueSystem = (name, team) => `The user's Sleeper league "${name}" is connected${team ? `; their team is "${team}"` : ""}. For questions about their team, standings, trades, draft picks or strategy, use the league tools (league_overview, get_team, draft_picks, league_player) before answering, and use the prospect tools for the incoming rookie class.

Strategy questions such as tanking, selling veterans or pushing for a title: weigh the user's current record and playoff odds, their roster's value and age (window), how much value a better draft slot is actually worth (draft_picks gives first-round value by slot), and how strong the top of the  class is. Give a clear recommendation with the key numbers, and the main risk. Many leagues ban deliberately losing, so frame it as rebuilding (selling aging veterans for picks and young players) rather than benching starters, and mention checking the league's rules.`;

const TOOLS = [
  {
    name: "search_players",
    description: "Find prospects by name (partial names and schools work). Returns id, position, school, class, tier, grade, overall and draft info. Use this first to get ids.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Player name, part of it, or a school" },
        position: { type: "string", enum: POSITIONS },
        class_year: { type: "integer", description: `Draft class, e.g. ${PROSPECT_CLASS} or 2021` },
      },
      required: ["query"],
    },
  },
  {
    name: "get_player",
    description: "Full report card for one prospect: every input grade with its raw value, tier, overall, z-score, pre-draft score, draft capital, model vs hype, college seasons and NFL outcome if drafted.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "compare_players",
    description: "Side-by-side report cards for two to four prospects (any positions or classes).",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } },
      required: ["ids"],
    },
  },
  {
    name: "find_similar",
    description: `Prospects at the same position with the closest grade profiles to a given player. target "${PROSPECT_CLASS}" finds comps in the upcoming class; "past" finds historical comps with known NFL outcomes; or pass a specific past class year.`,
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        target: { type: "string", description: `"${PROSPECT_CLASS}", "past", or a class year like "2021"` },
        limit: { type: "integer", minimum: 1, maximum: 12 },
      },
      required: ["id", "target"],
    },
  },
  {
    name: "rank_players",
    description: "List prospects filtered by position, class and tier, sorted by grade, overall, z, production, draftCapital or modelOverHype (production minus draft capital: who the numbers like more than the market).",
    input_schema: {
      type: "object",
      properties: {
        position: { type: "string", enum: POSITIONS },
        class_year: { type: "integer" },
        tier: { type: "string" },
        sort_by: { type: "string", enum: ["grade", "overall", "z", "production", "draftCapital", "modelOverHype"] },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: [],
    },
  },
  {
    name: "hit_rates",
    description: "How past prospects turned out: the share with a top-12/24/36 season in their first four NFL years, by our tier and by draft round, for one position.",
    input_schema: { type: "object", properties: { position: { type: "string", enum: POSITIONS } }, required: ["position"] },
  },
];

// League tools, offered only when the user has connected a Sleeper league.
const LEAGUE_TOOLS = [
  {
    name: "league_overview",
    description: "The connected league: settings, current week, and every team's record, standing, points, playoff odds, contender/rebuild window, average age, total and positional value ranks. Marks the user's team.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_team",
    description: "One team's full roster grouped by position (value, age, positional rank, points per game, starter flag) plus the draft picks it owns. Use team \"me\" for the user's team, or a team name, manager name or roster id.",
    input_schema: { type: "object", properties: { team: { type: "string" } }, required: ["team"] },
  },
  {
    name: "draft_picks",
    description: "Every draft pick in the league with its owner, original team, projected or set slot and value, plus first-round value by slot (to price moving up or down). Optionally one season.",
    input_schema: { type: "object", properties: { season: { type: "integer" } }, required: [] },
  },
  {
    name: "league_player",
    description: "Look up NFL players in the league by name: dynasty value, positional rank, age, points per game, 30-day value trend and which team owns them.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
];

// Every tool is a read-only lookup; inputs are checked here because the model's arguments are untrusted.
function runTool(name, input, data) {
  if (data.league) {
    const L = data.league;
    if (name === "league_overview") return leagueOverview(L);
    if (name === "get_team") {
      const t = findTeam(L, input?.team);
      return t ? teamDetail(L, t) : { error: `No team matching "${input?.team}". Teams: ${L.teams.map((x) => x.name).join(", ")}` };
    }
    if (name === "draft_picks") return draftPicks(L, Number.isInteger(input?.season) ? input.season : undefined);
    if (name === "league_player") {
      const hits = leaguePlayers(L, String(input?.query || "").slice(0, 80));
      return hits.length ? hits : { result: "No league players match." };
    }
  }
  const byId = (id) => data.all.find((x) => x.id === String(id || ""));
  const pos = POSITIONS.includes(input?.position) ? input.position : undefined;
  const cls = Number.isInteger(input?.class_year) ? input.class_year : undefined;
  switch (name) {
    case "search_players": {
      const hits = findPlayers(data.all, String(input?.query || "").slice(0, 80), { pos, classYear: cls });
      return hits.length ? hits.map(brief) : { result: "No matching prospects in the data." };
    }
    case "get_player": {
      const x = byId(input?.id);
      return x ? detail(x) : { error: `No prospect with id ${input?.id}. Use search_players.` };
    }
    case "compare_players": {
      const ids = Array.isArray(input?.ids) ? input.ids.slice(0, 4) : [];
      const found = ids.map(byId);
      if (found.some((x) => !x)) return { error: "One or more ids weren't found. Use search_players." };
      return found.map(detail);
    }
    case "find_similar": {
      const x = byId(input?.id);
      if (!x) return { error: `No prospect with id ${input?.id}.` };
      const t = String(input?.target || PROSPECT_CLASS);
      const classYear = t === "past" ? "past" : Number(t) || PROSPECT_CLASS;
      const limit = Math.min(Math.max(Number(input?.limit) || 6, 1), 12);
      return { player: brief(x), comps: similarTo(data.all, x, { classYear, limit }) };
    }
    case "rank_players":
      return rankPlayers(data.all, {
        pos, classYear: cls, tier: input?.tier ? String(input.tier) : undefined,
        sortBy: input?.sort_by, limit: Number(input?.limit) || 15,
      });
    case "hit_rates": {
      if (!pos) return { error: "position must be QB, RB, WR or TE" };
      return { byTier_drafted2018to2022: data.tierHits[pos] || {}, byDraftRound_drafted2012to2021: data.hitRates[pos] || {} };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// Which lookups deserve a card in the chat: comparisons, comp lists and single players.
function widgetFor(name, input, result, data) {
  if (!result || result.error) return [];
  const has = (id) => data.all.some((x) => x.id === id);
  if (name === "compare_players" && Array.isArray(input?.ids) && input.ids.length >= 2 && input.ids.slice(0, 2).every(has)) {
    return [{ type: "compare", a: input.ids[0], b: input.ids[1] }];
  }
  if (name === "find_similar" && has(input?.id)) {
    const t = String(input?.target || PROSPECT_CLASS);
    return [{ type: "comps", of: input.id, target: t === "past" ? "past" : Number(t) || PROSPECT_CLASS }];
  }
  if (name === "get_player" && has(input?.id)) return [{ type: "player", id: input.id }];
  return [];
}

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send JSON: { question, history }" }, { status: 400 });
  }
  const question = String(body?.question || "").trim().slice(0, MAX_QUESTION);
  if (!question) return Response.json({ error: "Ask a question." }, { status: 400 });

  // Earlier turns come back from the browser as plain text only.
  const history = (Array.isArray(body?.history) ? body.history : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (history.length && history[0].role !== "user") history.shift();

  // The connected Sleeper league, if any. Ids are numeric strings; anything else is ignored.
  const leagueId = isSleeperId(body?.league) ? String(body.league) : null;
  const userId = isSleeperId(body?.user) ? String(body.user) : null;

  try {
    const prospects = await loadData(new URL(req.url).origin);
    const league = leagueId ? await loadLeague(leagueId, userId) : null;
    const data = { ...prospects, league };
    const myTeam = league ? league.teams.find((t) => t.rosterId === league.me)?.name : null;
    const system = league ? [{ type: "text", text: SYSTEM }, { type: "text", text: leagueSystem(league.league.name, myTeam) }] : SYSTEM;
    const tools = league ? [...TOOLS, ...LEAGUE_TOOLS] : TOOLS;
    const client = new Anthropic();
    const messages = [...history, { role: "user", content: question }];
    // Cards the chat shows under the answer, collected from the lookups Claude made.
    const widgets = [];
    const addWidget = (w) => {
      const key = JSON.stringify(w);
      if (widgets.length < 4 && !widgets.some((v) => JSON.stringify(v) === key)) widgets.push(w);
    };

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        cache_control: { type: "ephemeral" },
        output_config: { effort: "medium" },
        system,
        tools,
        messages,
      });

      if (response.stop_reason === "refusal") {
        return Response.json({ answer: "Sorry, I can't help with that one. Try a question about the prospects or the model." });
      }
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !toolUses.length) {
        const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        return Response.json({ answer: answer || "I couldn't put an answer together. Try rephrasing.", widgets });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: toolUses.map((t) => {
          let result;
          try {
            result = runTool(t.name, t.input, data);
            widgetFor(t.name, t.input, result, data).forEach(addWidget);
          } catch (e) {
            return { type: "tool_result", tool_use_id: t.id, content: String(e?.message || e), is_error: true };
          }
          return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result) };
        }),
      });
    }
    return Response.json({ answer: "That question needed too many lookups. Try asking about fewer players at once." });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Busy right now. Try again in a minute." }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "not_configured" }, { status: 503 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `The AI service returned an error (${e.status}).` }, { status: 502 });
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
