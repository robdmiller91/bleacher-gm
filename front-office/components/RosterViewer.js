"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, Img, Pos } from "./ui";
import { PickIcon } from "./assets";
import { POSITIONS, fmt, ordinal } from "@/lib/model";

const GROUPS = [...POSITIONS, "Picks"];
const rankKey = (g) => (g === "Picks" ? "pickValueRank" : `${g}Rank`);
const valueKey = (g) => (g === "Picks" ? "pickValue" : g);

// Rank 1 is strongest; color the cell from green (top third) to red (bottom third).
function rankTone(rank, n) {
  const f = (rank - 1) / Math.max(n - 1, 1);
  return f <= 0.33 ? "g" : f >= 0.67 ? "b" : "m";
}

function TeamColumn({ data, team, inTrade, onToggle, side }) {
  const players = useMemo(
    () => Object.values(data.players).filter((p) => p.owner === team.rosterId && p.value > 0).sort((a, b) => b.value - a.value),
    [data, team],
  );
  const picks = data.picks.filter((k) => k.owner === team.rosterId);
  const n = data.teams.length;
  return (
    <div className="rv-team">
      <div className="rv-team-head">
        <Img src={team.avatar} className="avatar" />
        <div>
          <b>{team.name}</b>
          <span className="muted small">{team.wins}-{team.losses} · {ordinal(team.totalValueRank)} in value · {team.window}</span>
        </div>
      </div>
      {GROUPS.map((g) => {
        const list = g === "Picks" ? picks : players.filter((p) => p.pos === g);
        const rank = team[rankKey(g)];
        return (
          <div key={g} className="rv-group">
            <div className="rv-group-head">
              <b>{g === "Picks" ? "Draft picks" : `${g}s`}</b>
              <span className={`heat ${rankTone(rank, n)}`}>{ordinal(rank)}</span>
              <span className="muted small">{fmt(team[valueKey(g)])}</span>
            </div>
            {list.length === 0 && <div className="muted small rv-empty">None</div>}
            {list.map((a) => {
              const id = a.id;
              const on = inTrade.includes(id);
              return (
                <div key={id} className={`rv-row${on ? " on" : ""}`}>
                  {g === "Picks" ? <PickIcon k={a} size={30} /> : <Img src={a.img} className="avatar" />}
                  <span className="rv-name">
                    <span className="pname">{g === "Picks" ? `${a.label}${a.slotLabel ? ` (${a.officialSlot ? "" : "proj "}${a.slotLabel})` : ""}` : a.name}</span>
                    <span className="muted small">
                      {g === "Picks"
                        ? a.traded ? `via ${a.originalName}` : "Own pick"
                        : `${a.team || "FA"} · ${a.age ? `age ${Math.floor(a.age)}` : "—"}${a.ppg != null ? ` · ${a.ppg.toFixed(1)} ppg` : ""}`}
                    </span>
                  </span>
                  {g !== "Picks" && <Pos pos={a.pos} rank={a.posRank} />}
                  <b className="rv-val">{fmt(a.value)}</b>
                  {onToggle && (
                    <button className={`rv-add${on ? " on" : ""}`} onClick={() => onToggle(id)} title={on ? "Remove from trade" : side === "give" ? "Add to what you send" : "Add to what you receive"}>
                      {on ? "✓" : "+"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Overlay for checking positional groups mid-trade; closing it leaves the trade untouched.
export default function RosterViewer({ data, me, partner, give, get, onToggleGive, onToggleGet, onClose }) {
  const [compare, setCompare] = useState(partner);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const n = data.teams.length;
  const mine = data.teams.find((t) => t.rosterId === me);
  const other = data.teams.find((t) => t.rosterId === compare);
  const byValue = [...data.teams].sort((a, b) => a.totalValueRank - b.totalValueRank);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rv-modal">
        <div className="rv-head">
          <div>
            <h2>Rosters</h2>
            <span className="muted small">Positional groups across the league. Your trade stays as it is when you close this.</span>
          </div>
          <button className="btn" onClick={onClose}><Icon name="close" size={16} /> Back to trade</button>
        </div>

        <div className="card rv-grid-card">
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Team</th>
                  <th className="c">Record</th>
                  <th className="c">Window</th>
                  {GROUPS.map((g) => <th key={g} className="c">{g}</th>)}
                  <th className="c">Total</th>
                </tr>
              </thead>
              <tbody>
                {byValue.map((t) => (
                  <tr
                    key={t.rosterId}
                    className={`rv-league-row${t.rosterId === me ? " me" : ""}${t.rosterId === compare ? " sel" : ""}`}
                    onClick={() => t.rosterId !== me && setCompare(t.rosterId)}
                    title={t.rosterId === me ? "Your team" : `Show ${t.name}'s roster`}
                  >
                    <td>
                      <span className="rv-team-cell">
                        <Img src={t.avatar} className="avatar" />
                        <b>{t.name}</b>
                        {t.rosterId === me && <span className="chip accent">You</span>}
                        {t.rosterId === partner && t.rosterId !== me && <span className="chip">Trade partner</span>}
                      </span>
                    </td>
                    <td className="c">{t.wins}-{t.losses}</td>
                    <td className="c small">{t.window}</td>
                    {GROUPS.map((g) => (
                      <td key={g} className="c" title={`${fmt(t[valueKey(g)])} value`}>
                        <span className={`heat ${rankTone(t[rankKey(g)], n)}`}>{ordinal(t[rankKey(g)])}</span>
                      </td>
                    ))}
                    <td className="c"><b>{ordinal(t.totalValueRank)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ margin: "0.5rem 0 0" }}>Ranks are by total FantasyCalc value at each position (1st = strongest). Click a team to show its roster below.</p>
        </div>

        <div className="rv-columns">
          {mine && <TeamColumn data={data} team={mine} inTrade={give} onToggle={onToggleGive} side="give" />}
          {other && (
            <TeamColumn
              data={data}
              team={other}
              inTrade={other.rosterId === partner ? get : []}
              onToggle={other.rosterId === partner ? onToggleGet : null}
              side="get"
            />
          )}
        </div>
        {other && other.rosterId !== partner && (
          <p className="muted small" style={{ margin: 0 }}>Add-to-trade buttons appear for your current trade partner. Change the partner in the calculator to trade with {other.name}.</p>
        )}
      </div>
    </div>
  );
}
