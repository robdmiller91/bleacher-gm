"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Icon, Img, PageHead, PlayerCell, Pos, TeamSelect, Trend } from "@/components/ui";
import { POS_VAR, WINDOW_POS, fmt, ordinal, quantile, simulatePlayoffOdds, winProb } from "@/lib/model";

function Stat({ icon, label, value, extra }) {
  return (
    <div className="card stat">
      <div className="stat-icon"><Icon name={icon} /></div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}{extra ? <small>{extra}</small> : null}</div>
      </div>
    </div>
  );
}

function Radar({ axes, center }) {
  const size = 280;
  const c = size / 2;
  const R = size / 2 - 40;
  const pt = (v, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
    const r = R * Math.max(0.06, Math.min(1, v));
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const poly = axes.map((ax, i) => pt(ax.value, i).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 320, display: "block", margin: "0 auto" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={axes.map((_, i) => pt(f, i).join(",")).join(" ")} fill="none" stroke="var(--border)" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(1, i);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--border)" />;
      })}
      <polygon points={poly} fill="var(--accent)" fillOpacity="0.18" stroke="var(--accent)" strokeWidth="2" />
      {axes.map((ax, i) => {
        const [x, y] = pt(ax.value, i);
        const [lx, ly] = pt(1.22, i);
        return (
          <g key={ax.label}>
            <circle cx={x} cy={y} r="5" fill={ax.color} stroke="var(--surface)" strokeWidth="2">
              <title>{`${ax.label}: ${ordinal(ax.rank)} in league`}</title>
            </circle>
            <text x={lx} y={ly - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill={ax.color}>{ax.label}</text>
            <text x={lx} y={ly + 9} textAnchor="middle" fontSize="10" fill="var(--muted)">{ordinal(ax.rank)}</text>
          </g>
        );
      })}
      <text x={c} y={c + 8} textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--text)">{center}</text>
    </svg>
  );
}

function PointsChart({ mine, median }) {
  if (!mine.length) return <div className="empty">No completed weeks yet — this fills in after Week 1.</div>;
  const W = 600;
  const H = 200;
  const all = [...mine, ...median].map((d) => d.y);
  const max = Math.max(...all) * 1.1;
  const min = Math.min(...all) * 0.85;
  const x = (i) => (mine.length === 1 ? W / 2 : (i / (mine.length - 1)) * (W - 40) + 20);
  const y = (v) => H - ((v - min) / (max - min || 1)) * (H - 20) - 10;
  const path = (d) => d.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.y)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%">
      <path d={`${path(mine)} L${x(mine.length - 1)},${H} L${x(0)},${H} Z`} fill="var(--accent)" opacity="0.1" />
      <path d={path(median)} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 5" />
      <path d={path(mine)} fill="none" stroke="var(--accent)" strokeWidth="3" />
      {mine.map((p, i) => (
        <g key={p.week}>
          <circle cx={x(i)} cy={y(p.y)} r="4.5" fill="var(--accent)">
            <title>{`Week ${p.week}: ${p.y.toFixed(1)} (league median ${median[i].y.toFixed(1)})`}</title>
          </circle>
          <text x={x(i)} y={H + 18} textAnchor="middle" fontSize="11" fill="var(--muted)">Wk {p.week}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Dashboard() {
  const { data, live } = useApp();
  const [teamId, setTeamId] = useState(data.me ?? data.teams[0].rosterId);
  const [posFilter, setPosFilter] = useState("ALL");
  const [showLineups, setShowLineups] = useState(false);
  const team = data.teams.find((t) => t.rosterId === teamId) || data.teams[0];
  const n = data.teams.length;
  const currentWeek = data.state.week;

  const odds = useMemo(
    () =>
      simulatePlayoffOdds({
        teams: data.teams,
        weekly: data.weekly,
        currentWeek,
        playoffWeekStart: data.league.playoffWeekStart,
        playoffTeams: data.league.playoffTeams,
      }),
    [data, currentWeek],
  );

  const done = data.weekly.filter((w) => w.week < currentWeek && w.points > 0);
  const myWeeks = done.filter((w) => w.rosterId === team.rosterId).sort((a, b) => a.week - b.week);
  const avg = myWeeks.length ? myWeeks.reduce((s, w) => s + w.points, 0) / myWeeks.length : null;
  const lastWeek = myWeeks[myWeeks.length - 1];
  const median = myWeeks.map((w) => ({
    week: w.week,
    y: quantile(done.filter((d) => d.week === w.week).map((d) => d.points), 0.5),
  }));

  // ---- This week's matchup (live) ----
  const mine = live?.matchups.find((m) => m.rosterId === team.rosterId);
  const opp = mine ? live.matchups.find((m) => m.matchupId === mine.matchupId && m.rosterId !== mine.rosterId) : null;
  const oppTeam = opp ? data.teams.find((t) => t.rosterId === opp.rosterId) : null;
  const projOf = (m) => (m ? m.starters.reduce((s, pid) => s + (live.projections[pid] || 0), 0) : 0);
  const myProj = projOf(mine);
  const oppProj = projOf(opp);
  const pWin = mine && opp ? winProb(myProj, oppProj) : null;
  const slots = data.league.rosterPositions.filter((s) => !["BN", "IR", "TAXI"].includes(s));
  const record = (rid) => {
    const r = live?.records?.[rid] || data.teams.find((t) => t.rosterId === rid);
    return r ? `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}` : "";
  };

  const axes = [
    { label: "QB", rank: team.QBRank, color: POS_VAR.QB },
    { label: "RB", rank: team.RBRank, color: POS_VAR.RB },
    { label: "WR", rank: team.WRRank, color: POS_VAR.WR },
    { label: "TE", rank: team.TERank, color: POS_VAR.TE },
    { label: "PICKS", rank: team.pickValueRank, color: POS_VAR.PK },
  ].map((a) => ({ ...a, value: n > 1 ? (n - a.rank) / (n - 1) : 1 }));

  const roster = Object.values(data.players)
    .filter((p) => p.owner === team.rosterId && (posFilter === "ALL" || p.pos === posFilter))
    .sort((a, b) => b.value - a.value);
  const topValue = Math.max(1, ...roster.map((p) => p.value));
  const injuries = Object.values(data.players).filter((p) => p.owner === team.rosterId && p.injury);

  return (
    <>
      <PageHead title="Your" accent="Dashboard" sub={`${data.league.name} · ${data.league.season} · Week ${currentWeek}`}>
        <TeamSelect value={team.rosterId} onChange={setTeamId} />
      </PageHead>

      <div className="stats-row">
        <Stat icon="chart" label="Standings" value={ordinal(team.standing)} extra={record(team.rosterId)} />
        <Stat
          icon="target"
          label="Avg. Points"
          value={avg != null ? avg.toFixed(1) : "—"}
          extra={lastWeek && avg ? <span className={lastWeek.points >= avg ? "up" : "down"}>{lastWeek.points >= avg ? "↗" : "↘"} {lastWeek.points.toFixed(1)} last</span> : null}
        />
        <Stat icon="trophy" label="Playoff Odds" value={`${Math.round(odds[team.rosterId] ?? 0)}%`} />
        <Stat icon="bolt" label="Dynasty Rank" value={`#${team.totalValueRank}`} extra={team.window} />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-title">
            <h3>Matchup</h3>
            {mine && opp ? <button className="link" onClick={() => setShowLineups((s) => !s)}>{showLineups ? "Hide lineups" : "View lineups"}</button> : null}
          </div>
          {!mine || !opp ? (
            <div className="empty">No matchup this week yet. Sleeper publishes pairings before kickoff.</div>
          ) : (
            <>
              <div className="matchup">
                <div className="mteam">
                  <Img src={team.avatar} />
                  <div className="mteam-name">{team.name}</div>
                  <div className="muted small">{record(team.rosterId)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1.4rem" }}>
                  <div style={{ textAlign: "right" }}>
                    <div className="mscore">{mine.points.toFixed(2)}</div>
                    <div className="up small">Proj {myProj.toFixed(1)}</div>
                  </div>
                  <div className="vs">VS</div>
                  <div>
                    <div className="mscore">{opp.points.toFixed(2)}</div>
                    <div className="down small">Proj {oppProj.toFixed(1)}</div>
                  </div>
                </div>
                <div className="mteam right">
                  <Img src={oppTeam?.avatar} />
                  <div className="mteam-name">{oppTeam?.name}</div>
                  <div className="muted small">{record(opp.rosterId)}</div>
                </div>
              </div>
              <div className="prob">
                <b className={pWin >= 0.5 ? "up" : "down"}>{(pWin * 100).toFixed(1)}%</b>
                <div className="prob-track">
                  <div style={{ width: `${pWin * 100}%`, background: pWin >= 0.5 ? "var(--good)" : "var(--bad)" }} />
                  <div style={{ width: `${(1 - pWin) * 100}%`, background: pWin >= 0.5 ? "var(--bad)" : "var(--good)" }} />
                </div>
                <b className={pWin < 0.5 ? "up" : "down"} style={{ textAlign: "right" }}>{((1 - pWin) * 100).toFixed(1)}%</b>
              </div>
              <p className="muted small" style={{ marginBottom: 0 }}>Win probability from Sleeper projections for each starting lineup under your scoring. Scores refresh every minute.</p>
              {showLineups && (
                <div className="lineups">
                  {slots.map((slot, i) => {
                    const a = data.players[mine.starters[i]];
                    const b = data.players[opp.starters[i]];
                    const pts = (m, pid) => (pid && m.playersPoints[pid] != null ? m.playersPoints[pid].toFixed(1) : "–");
                    const pj = (pid) => (pid && live.projections[pid] != null ? live.projections[pid].toFixed(1) : "–");
                    return (
                      <div className="lineup-row" key={slot + i}>
                        <div>{a ? <PlayerCell p={a} /> : <span className="muted">Empty</span>}</div>
                        <span className="num muted small">{pj(mine.starters[i])}</span>
                        <span className="num"><b>{pts(mine, mine.starters[i])}</b></span>
                        <span className="lineup-slot">{slot.replace("SUPER_FLEX", "SF").replace("REC_FLEX", "RF")}</span>
                        <span className="num"><b>{pts(opp, opp.starters[i])}</b></span>
                        <span className="num muted small">{pj(opp.starters[i])}</span>
                        <div className="r" style={{ display: "flex" }}>{b ? <PlayerCell p={b} /> : <span className="muted">Empty</span>}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="card-title"><h3>Power Rankings</h3><span className="muted small">dynasty value</span></div>
          <Radar axes={axes} center={ordinal(team.totalValueRank)} />
        </div>
      </div>

      <div className="dash-3">
        <div className="card">
          <div className="card-title">
            <h3>Weekly Points</h3>
            <span className="small"><b style={{ color: "var(--accent)" }}>— You</b> <span className="muted">- - Median</span></span>
          </div>
          <PointsChart mine={myWeeks.map((w) => ({ week: w.week, y: w.points }))} median={median} />
        </div>

        <div className="card">
          <div className="card-title"><h3>Position Breakdown</h3><span className="chip accent">{team.window}</span></div>
          {axes.map((a) => (
            <div className="pb-row" key={a.label}>
              <b style={{ color: a.color }}>{a.label === "PICKS" ? "PK" : a.label}</b>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(4, a.value * 100)}%`, background: a.color }} /></div>
              <span>{ordinal(a.rank)} of {n}</span>
            </div>
          ))}
          <div className="scale"><div className="scale-marker" style={{ left: `${WINDOW_POS[team.window] ?? 50}%` }} /></div>
          <div className="scale-labels"><span>Contend</span><span>Rebuild</span></div>
        </div>

        <div className="card">
          <div className="card-title"><h3>Injury Report</h3><span className="muted small">from Sleeper</span></div>
          {injuries.length === 0 ? (
            <div className="empty">No injury designations on this roster.</div>
          ) : (
            injuries.map((p) => (
              <div className="list-row" key={p.id}>
                <div style={{ flex: 1, minWidth: 0 }}><PlayerCell p={p} sub={p.injuryPart || p.team} /></div>
                <span className="chip" style={{ color: "var(--bad)" }}>{p.injury}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="card-title">
          <h3>Roster <span className="chip" style={{ marginLeft: 6 }}>{roster.length} players</span></h3>
          <div className="seg">
            {["ALL", "QB", "RB", "WR", "TE"].map((p) => (
              <button key={p} className={posFilter === p ? "on" : ""} onClick={() => setPosFilter(p)}>{p === "ALL" ? "All" : p}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Player</th>
                <th>Status</th>
                <th className="c">Age</th>
                <th className="c">PPG</th>
                <th className="c sorted">Value ↓</th>
                <th className="c">30-Day</th>
                <th style={{ minWidth: 180 }}>vs. Top Asset</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.id}>
                  <td><PlayerCell p={p} /></td>
                  <td><span className="chip">{p.status}</span></td>
                  <td className="c">{p.age ? Math.floor(p.age) : "—"}</td>
                  <td className="c">{p.ppg != null ? p.ppg.toFixed(1) : "—"}</td>
                  <td className="c"><b>{fmt(p.value)}</b></td>
                  <td className="c"><Trend value={p.trend} /></td>
                  <td>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(p.value / topValue) * 100}%`, background: POS_VAR[p.pos] || "var(--k)" }} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
