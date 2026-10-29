// One player's path through this league: drafted, traded, claimed, added and dropped, newest first.
// Built from /api/history, which covers every season linked to the league.

import { ordinal } from "./model";

const pickLabel = (k, fromName) => `${k.season} ${ordinal(k.round)} Rd${k.originalName && k.originalName !== fromName ? ` (${k.originalName})` : ""}`;

export function playerTimeline(hist, id) {
  if (!hist || !id) return [];
  const out = [];

  for (const d of hist.drafts || []) {
    const p = d.picks.find((x) => x.playerId === id);
    if (!p) continue;
    const n = d.slots.length || Math.max(...d.picks.map((x) => x.slot));
    const by = d.slots.find((s) => s.rosterId === p.rosterId)?.name || `Roster ${p.rosterId}`;
    out.push({
      kind: "drafted",
      key: `d-${d.draftId}`,
      date: d.date,
      season: d.season,
      team: by,
      pick: `${p.round}.${String(p.pickNo - (p.round - 1) * n).padStart(2, "0")}`,
      draft: d.label,
    });
  }

  for (const t of hist.trades || []) {
    const to = t.sides.find((s) => s.players.some((p) => p.id === id));
    if (!to) continue;
    const others = t.sides.filter((s) => s !== to);
    // What the receiving team sent: anything another side got from them (or everything, in a two-team trade).
    const sent = (s) => others.length === 1 || s.from === to.nameThen;
    out.push({
      kind: "traded",
      key: `t-${t.id}`,
      date: t.created,
      season: t.season,
      week: t.week,
      team: to.nameThen,
      from: to.players.find((p) => p.id === id)?.from || others.map((s) => s.nameThen).join(", "),
      got: [
        ...to.players.map((p) => ({ id: p.id, label: p.name })),
        ...to.picks.map((k) => ({ label: pickLabel(k, k.from) })),
      ],
      gave: others.flatMap((s) => [
        ...s.players.filter(sent).map((p) => ({ id: p.id, label: p.name })),
        ...s.picks.filter(sent).map((k) => ({ label: pickLabel(k, to.nameThen) })),
      ]),
    });
  }

  for (const m of hist.moves || []) {
    const add = m.adds?.[id];
    const drop = m.drops?.[id];
    if (!add && !drop) continue;
    const base = { key: `m-${m.id}`, date: m.created, season: m.season, week: m.week };
    if (add) {
      const kind = m.type === "waiver" ? "claimed" : m.type === "commissioner" ? "moved" : "added";
      // Players the same team let go in that move, shown like Sleeper does.
      const dropped = Object.entries(m.drops || {}).filter(([pid, team]) => team === add && pid !== id).map(([pid]) => pid);
      out.push({ ...base, kind, team: add, bid: m.bid, dropped });
    } else {
      out.push({ ...base, kind: m.type === "commissioner" ? "moved" : "dropped", team: drop, released: true });
    }
  }

  return out.sort((a, b) => (b.date || 0) - (a.date || 0) || b.season - a.season);
}
