import { SLEEPER, errorResponse, getAllPlayers, leagueFrom, playerImage, safeJSON, teamName } from "@/lib/sleeper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sleeper stores each season as its own league linked by previous_league_id.
async function leagueChain(leagueId) {
  const out = [];
  const seen = new Set();
  let id = leagueId;
  while (id && id !== "0" && !seen.has(id)) {
    seen.add(id);
    const league = await safeJSON(`${SLEEPER}/league/${id}`, null);
    if (!league) break;
    const [users, rosters, drafts] = await Promise.all([
      safeJSON(`${SLEEPER}/league/${id}/users`, []),
      safeJSON(`${SLEEPER}/league/${id}/rosters`, []),
      safeJSON(`${SLEEPER}/league/${id}/drafts`, []),
    ]);
    out.push({ id, season: Number(league.season), users, rosters, drafts });
    id = league.previous_league_id;
  }
  return out;
}

function rosterNames(entry) {
  const users = Object.fromEntries(entry.users.map((u) => [String(u.user_id), u]));
  const out = {};
  for (const r of entry.rosters) {
    const u = users[String(r.owner_id)] || {};
    out[Number(r.roster_id)] = { name: teamName(u, r.roster_id), ownerId: String(r.owner_id || "") };
  }
  return out;
}

async function draftsFor(entry, names) {
  const results = [];
  for (const d of entry.drafts) {
    if (!d.draft_id) continue;
    const raw = await safeJSON(`${SLEEPER}/draft/${d.draft_id}/picks`, []);
    if (!raw.length) continue;
    const slotToRoster = {};
    for (const [slot, rid] of Object.entries(d.slot_to_roster_id || {})) slotToRoster[Number(slot)] = Number(rid);
    if (!Object.keys(slotToRoster).length) {
      const byOwner = Object.fromEntries(Object.entries(names).map(([rid, n]) => [n.ownerId, Number(rid)]));
      for (const [uid, slot] of Object.entries(d.draft_order || {})) if (byOwner[uid]) slotToRoster[Number(slot)] = byOwner[uid];
    }
    const picks = raw.map((p) => {
      const slot = Number(p.draft_slot) || null;
      const actual = Number(p.roster_id) || null;
      const original = (slot && slotToRoster[slot]) || actual;
      const m = p.metadata || {};
      return {
        round: Number(p.round),
        pickNo: Number(p.pick_no),
        slot: slot || Number(p.pick_no),
        original,
        rosterId: actual,
        traded: original != null && actual != null && original !== actual,
        playerId: p.player_id ? String(p.player_id) : null,
        name: [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unknown",
        pos: m.position || "",
        team: m.team || "",
        img: p.player_id ? playerImage(p.player_id) : null,
        keeper: !!p.is_keeper,
      };
    });
    const rounds = Math.max(...picks.map((p) => p.round));
    results.push({
      draftId: d.draft_id,
      season: entry.season,
      type: d.type,
      date: d.last_picked || d.start_time || 0,
      rounds,
      label: `${entry.season} ${rounds >= 10 ? "Startup" : "Rookie"} Draft`,
      slots: Object.keys(slotToRoster).length
        ? Object.entries(slotToRoster).map(([slot, rid]) => ({ slot: Number(slot), rosterId: rid, name: names[rid]?.name || `Roster ${rid}` }))
        : [],
      picks,
    });
  }
  return results;
}

// Trades in full, plus waiver and free-agent adds/drops in a compact form for player timelines.
async function transactionsFor(entry, names, players) {
  const weeks = Array.from({ length: 19 }, (_, i) => i); // week 0 = offseason
  const all = await Promise.all(weeks.map((w) => safeJSON(`${SLEEPER}/league/${entry.id}/transactions/${w}`, [])));
  const trades = [];
  const moves = [];
  const teamOf = (map) => Object.fromEntries(Object.entries(map || {}).map(([pid, rid]) => [pid, names[Number(rid)]?.name || `Roster ${rid}`]));
  all.forEach((list, week) => {
    for (const tx of Array.isArray(list) ? list : []) {
      if (tx.status !== "complete") continue;
      if (tx.type !== "trade") {
        if (tx.adds || tx.drops) {
          moves.push({
            id: tx.transaction_id,
            season: entry.season,
            week,
            created: tx.status_updated || tx.created || 0,
            type: tx.type,
            adds: teamOf(tx.adds),
            drops: teamOf(tx.drops),
            bid: tx.settings?.waiver_bid ?? null,
          });
        }
        continue;
      }
      const sides = {};
      const side = (rid) => {
        const r = Number(rid);
        if (!sides[r]) sides[r] = { rosterId: r, ownerId: names[r]?.ownerId || "", nameThen: names[r]?.name || `Roster ${r}`, players: [], picks: [] };
        return sides[r];
      };
      (tx.roster_ids || []).forEach(side);
      for (const [pid, toRid] of Object.entries(tx.adds || {})) {
        const meta = players[pid] || {};
        side(toRid).players.push({
          id: String(pid),
          name: meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(" ") || String(pid),
          pos: meta.position || "",
          team: meta.team || "",
          img: playerImage(pid),
          from: names[Number((tx.drops || {})[pid])]?.name || "",
        });
      }
      for (const pk of tx.draft_picks || []) {
        side(pk.owner_id).picks.push({
          season: Number(pk.season),
          round: Number(pk.round),
          original: Number(pk.roster_id),
          originalName: names[Number(pk.roster_id)]?.name || `Roster ${pk.roster_id}`,
          from: names[Number(pk.previous_owner_id)]?.name || "",
        });
      }
      const list2 = Object.values(sides).filter((s) => s.players.length || s.picks.length || (tx.roster_ids || []).includes(s.rosterId));
      if (!list2.some((s) => s.players.length || s.picks.length)) continue;
      trades.push({ id: tx.transaction_id, season: entry.season, week, created: tx.status_updated || tx.created || 0, sides: list2 });
    }
  });
  return { trades, moves };
}

export async function GET(req) {
  try {
    const [chain, players] = await Promise.all([leagueChain(leagueFrom(req)), getAllPlayers()]);
    const currentNames = rosterNames(chain[0] || { users: [], rosters: [] });
    const perSeason = await Promise.all(
      chain.map(async (entry) => {
        const names = rosterNames(entry);
        const [drafts, tx] = await Promise.all([draftsFor(entry, names), transactionsFor(entry, names, players)]);
        return { drafts, ...tx };
      }),
    );
    const drafts = perSeason.flatMap((s) => s.drafts).sort((a, b) => b.season - a.season || a.rounds - b.rounds);
    const trades = perSeason.flatMap((s) => s.trades).sort((a, b) => b.created - a.created);
    const moves = perSeason.flatMap((s) => s.moves).sort((a, b) => b.created - a.created);

    // Which player each pick became, so traded picks can be valued today.
    const pickBecame = {};
    for (const d of drafts) {
      if (d.rounds >= 10) continue; // startup drafts don't use tradeable rookie picks
      for (const p of d.picks) if (p.original && p.playerId) pickBecame[`${d.season}-${p.round}-${p.original}`] = { id: p.playerId, name: p.name };
    }

    const managers = Object.values(currentNames).map((n) => ({ ownerId: n.ownerId, name: n.name }));
    return Response.json(
      { seasons: chain.map((c) => c.season), managers, drafts, trades, moves, pickBecame },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
