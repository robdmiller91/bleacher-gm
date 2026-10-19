"use client";

import { Fragment, useMemo, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Img, PageHead, PlayerCell, Trend, heatScale } from "@/components/ui";
import { TIERS, fmt, teamLogo, tierFor } from "@/lib/model";

const COLUMNS = [
  { key: "value", label: "Value" },
  { key: "trend", label: "30-Day" },
  { key: "age", label: "Age", asc: true },
  { key: "ppg", label: "FPTS/G" },
  { key: "gp", label: "Played" },
  { key: "snapPct", label: "Snap %" },
];

export default function Rankings() {
  const { data } = useApp();
  const [pos, setPos] = useState("ALL");
  const [q, setQ] = useState("");
  const [avail, setAvail] = useState("all");
  const [ageMax, setAgeMax] = useState(40);
  const [minGames, setMinGames] = useState(0);
  const [sort, setSort] = useState({ key: "value", asc: false });

  const teamById = useMemo(() => Object.fromEntries(data.teams.map((t) => [t.rosterId, t])), [data]);
  const base = useMemo(
    () => Object.values(data.players).filter((p) => p.value > 0 && ["QB", "RB", "WR", "TE"].includes(p.pos)),
    [data],
  );

  // Heat thresholds per position so a TE isn't judged against WR volume.
  const heat = useMemo(() => {
    const out = {};
    for (const P of ["QB", "RB", "WR", "TE"]) {
      const pool = base.filter((p) => p.pos === P && p.gp >= 2);
      out[P] = { ppg: heatScale(pool.map((p) => p.ppg)), snap: heatScale(pool.map((p) => p.snapPct)) };
    }
    return out;
  }, [base]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = base.filter((p) => {
      if (pos !== "ALL" && p.pos !== pos) return false;
      if (term && !`${p.name} ${p.team}`.toLowerCase().includes(term)) return false;
      if (avail === "rostered" && !p.owner) return false;
      if (avail === "fa" && p.owner) return false;
      if (avail === "mine" && p.owner !== data.me) return false;
      if (p.age && p.age > ageMax) return false;
      if ((p.gp || 0) < minGames) return false;
      return true;
    });
    const dir = sort.asc ? 1 : -1;
    return list.sort((a, b) => {
      const av = a[sort.key] ?? (sort.asc ? Infinity : -Infinity);
      const bv = b[sort.key] ?? (sort.asc ? Infinity : -Infinity);
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir || b.value - a.value;
    });
  }, [base, pos, q, avail, ageMax, minGames, sort, data.me]);

  const byValue = sort.key === "value" && !sort.asc;
  const clickSort = (c) =>
    setSort((s) => (s.key === c.key ? { key: c.key, asc: !s.asc } : { key: c.key, asc: !!c.asc }));
  const reset = () => {
    setPos("ALL");
    setQ("");
    setAvail("all");
    setAgeMax(40);
    setMinGames(0);
    setSort({ key: "value", asc: false });
  };

  let lastTier = null;
  return (
    <>
      <PageHead title="Dynasty" accent="Rankings" sub="Live FantasyCalc values, Sleeper season stats under your scoring, and who owns everyone in your league. Click any player for the full breakdown.">
        <div className="seg">
          {["ALL", "QB", "RB", "WR", "TE"].map((p) => (
            <button key={p} className={pos === p ? "on" : ""} onClick={() => setPos(p)}>{p === "ALL" ? "All" : p}</button>
          ))}
        </div>
      </PageHead>

      <div className="rank-layout">
        <div className="card" style={{ padding: "0.6rem 0.8rem" }}>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th className="rnk">#</th>
                  <th>Player</th>
                  <th className="c">Team</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={`c sortable${sort.key === c.key ? " sorted" : ""}`} onClick={() => clickSort(c)}>
                      {c.label} {sort.key === c.key ? (sort.asc ? "↑" : "↓") : "↕"}
                    </th>
                  ))}
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const tier = tierFor(p.value);
                  const showTier = byValue && tier.key !== lastTier;
                  lastTier = tier.key;
                  const owner = teamById[p.owner];
                  const h = heat[p.pos];
                  return (
                    <Fragment key={p.id}>
                      {showTier && (
                        <tr className="tier-row">
                          <td colSpan={COLUMNS.length + 4}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span className="tier-badge">
                                <i style={{ background: tier.color }}>{tier.key}</i>
                                <span style={{ color: tier.color }}>TIER</span>
                              </span>
                              <span className="muted small" style={{ marginLeft: 10 }}>
                                {tier.min ? `${fmt(tier.min)}+ value` : "under 1,500"}
                              </span>
                              <span className="tier-line" style={{ background: tier.color }} />
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr style={p.owner === data.me ? { background: "var(--accent-soft)" } : undefined}>
                        <td className="rnk">{i + 1}</td>
                        <td><PlayerCell p={p} sub={p.ovrRank ? `#${p.ovrRank} overall` : p.team} /></td>
                        <td className="c">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Img src={teamLogo(p.team)} className="avatar" /> <span className="small">{p.team}</span>
                          </span>
                        </td>
                        <td className="c"><b>{fmt(p.value)}</b></td>
                        <td className="c"><Trend value={p.trend} /></td>
                        <td className="c">{p.age ? Math.floor(p.age) : "—"}</td>
                        <td className="c"><span className={`heat ${p.gp >= 2 ? h.ppg(p.ppg) : "m"}`}>{p.ppg != null ? p.ppg.toFixed(1) : "—"}</span></td>
                        <td className="c">{p.gp || 0}</td>
                        <td className="c"><span className={`heat ${p.gp >= 2 ? h.snap(p.snapPct) : "m"}`}>{p.snapPct != null ? p.snapPct.toFixed(0) : "—"}</span></td>
                        <td>
                          {owner ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <Img src={owner.avatar} className="avatar" />
                              <span className="small" style={{ fontWeight: p.owner === data.me ? 700 : 500 }}>{owner.name}</span>
                            </span>
                          ) : (
                            <span className="chip accent">Free agent</span>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <div className="empty">No players match these filters.</div>}
          </div>
        </div>

        <aside className="filters">
          <div className="card">
            <div className="card-title" style={{ marginBottom: "0.7rem" }}>
              <h3>Filters</h3>
              <button className="link" onClick={reset}>Reset</button>
            </div>
            <input className="input" style={{ width: "100%" }} placeholder="Search player or NFL team" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="card">
            <h4>Availability</h4>
            <div className="radio-list">
              {[["all", "All players"], ["rostered", "Rostered in league"], ["fa", "Free agents"], ["mine", "My team"]].map(([k, l]) => (
                <button key={k} className={avail === k ? "on" : ""} onClick={() => setAvail(k)}>
                  <i /> {l}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h4>Max age</h4>
            <div className="range-row">
              <span className="muted small">20</span>
              <input type="range" min="20" max="40" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} />
              <input className="input" value={ageMax} readOnly />
            </div>
            <h4 style={{ marginTop: "1rem" }}>Min games played</h4>
            <div className="range-row">
              <span className="muted small">0</span>
              <input type="range" min="0" max="17" value={minGames} onChange={(e) => setMinGames(Number(e.target.value))} />
              <input className="input" value={minGames} readOnly />
            </div>
          </div>

          <div className="card small muted">
            <b style={{ color: "var(--text)" }}>Tiers</b> break on dynasty value:{" "}
            {TIERS.map((t) => `${t.key} ${t.min ? `${fmt(t.min)}+` : "rest"}`).join(" · ")}. Green/red cells compare players at the same position with 2+ games.
          </div>
        </aside>
      </div>
    </>
  );
}
