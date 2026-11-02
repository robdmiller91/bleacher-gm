"use client";

import { ShareCard } from "@/components/charts";
import { POSITIONS, fmt, ordinal, shareOf, starterValueTotals } from "@/lib/model";

function Delta({ before, after, lowerIsBetter = true, format = (v) => v }) {
  if (after == null || before === after) return <span className="muted">{format(before)}</span>;
  const better = lowerIsBetter ? after < before : after > before;
  return (
    <span>
      <span className="muted" style={{ textDecoration: "line-through", marginRight: 6 }}>{format(before)}</span>
      <b className={better ? "up" : "down"}>{format(after)}</b>
    </span>
  );
}

// A team's ranks, values and league shares now, and after a set of moves (Roster Lab, Mock Draft).
export function ImpactPanel({ data, rosterId, after, afterPlayers }) {
  const now = data.teams.find((t) => t.rosterId === rosterId);
  const aft = after?.find((t) => t.rosterId === rosterId);
  const rp = data.league.rosterPositions;
  const valueNow = shareOf(Object.fromEntries(data.teams.map((t) => [t.rosterId, t.totalValue])), rosterId);
  const valueAft = after ? shareOf(Object.fromEntries(after.map((t) => [t.rosterId, t.totalValue])), rosterId) : null;
  const startNow = shareOf(starterValueTotals(data.teams, data.players, rp), rosterId);
  const startAft = after ? shareOf(starterValueTotals(after, afterPlayers, rp), rosterId) : null;
  const rows = [
    ["Overall rank", "totalValueRank", true, ordinal],
    ["Total value", "totalValue", false, fmt],
    ["Player value", "playerValue", false, fmt],
    ["Pick value", "pickValue", false, fmt],
    ...POSITIONS.map((p) => [`${p} rank`, `${p}Rank`, true, ordinal]),
    ["Picks rank", "pickValueRank", true, ordinal],
    ["Avg age", "avgAge", true, (v) => v ?? "—"],
  ];
  return (
    <div className="dash-grid" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", marginTop: 0 }}>
      <div className="card">
        <div className="card-title">
          <h3>{now.name}</h3>
          <span className="chip accent">{now.window}{aft && aft.window !== now.window ? ` → ${aft.window}` : ""}</span>
        </div>
        <table className="t">
          <tbody>
            {rows.map(([label, key, lower, f]) => (
              <tr key={key}>
                <td className="muted">{label}</td>
                <td style={{ textAlign: "right" }}><Delta before={now[key]} after={aft?.[key]} lowerIsBetter={lower} format={f} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-title"><h3>Share of League</h3></div>
        <div className="share-row">
          <ShareCard kind="value" label="Value share" pct={valueNow.pct} rank={valueNow.rank} after={valueAft} />
          <ShareCard kind="production" label="Starter share" pct={startNow.pct} rank={startNow.rank} after={startAft} />
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Starter share is the value in each team's best possible lineup, which is a proxy for how much weekly firepower it has.</p>
      </div>
    </div>
  );
}
