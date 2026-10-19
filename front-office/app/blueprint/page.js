"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppShell";
import { Icon, Img, PageHead, Pos, TeamSelect, useCornerstones } from "@/components/ui";
import { GradeCircle, Legend, ShareCard, TrajectoryChart } from "@/components/charts";
import { PickIcon } from "@/components/assets";
import {
  OUTLOOK_COLORS, POSITIONS, POS_VAR, WINDOW_POS, fmt, gradeFromRank, optimalStarters, outlookLabels,
  ordinal, rosterArchetype, shareOf, starterValueTotals, trajectory,
} from "@/lib/model";

function PlayerCard({ p, star, onStar, badge }) {
  const { openPlayer } = useApp();
  return (
    <div className="pcard" style={{ "--c": POS_VAR[p.pos] || "var(--k)" }}>
      {onStar && (
        <button className={`pcard-star${star ? " on" : ""}`} onClick={() => onStar(p.id)} title={star ? "Remove cornerstone" : "Mark as cornerstone (untouchable)"}>
          <Icon name="star" size={15} />
        </button>
      )}
      <button className="plink pcard-body" onClick={() => openPlayer(p.id)}>
        <div className="pcard-photo"><Img src={p.img} alt={p.name} /></div>
        <div className="pcard-info">
          {badge ? <div className="pcard-badge">{badge}</div> : null}
          <div className="pname">{p.name}</div>
          <div className="asset-meta"><Pos pos={p.pos} rank={p.posRank} /><span className="muted small">{p.age ? `${Math.floor(p.age)}y` : ""}</span></div>
          <div className="pcard-value">{fmt(p.value)}</div>
        </div>
      </button>
    </div>
  );
}

export default function Blueprint() {
  const { data } = useApp();
  const [teamId, setTeamId] = useState(data.me ?? data.teams[0].rosterId);
  const [stars, toggleStar] = useCornerstones(teamId);
  const team = data.teams.find((t) => t.rosterId === teamId) || data.teams[0];
  const n = data.teams.length;
  const lg = data.league;

  const roster = useMemo(
    () => Object.values(data.players).filter((p) => p.owner === team.rosterId).sort((a, b) => b.value - a.value),
    [data, team.rosterId],
  );
  const starters = useMemo(() => optimalStarters(roster, lg.rosterPositions), [roster, lg.rosterPositions]);
  const starterTotals = useMemo(() => starterValueTotals(data.teams, data.players, lg.rosterPositions), [data, lg.rosterPositions]);
  const valueTotals = Object.fromEntries(data.teams.map((t) => [t.rosterId, t.totalValue]));
  const valueShare = shareOf(valueTotals, team.rosterId);
  const starterShare = shareOf(starterTotals, team.rosterId);
  const traj = useMemo(() => trajectory(data.players, team.rosterId), [data, team.rosterId]);
  const outlook = outlookLabels(traj);
  const leagueAvgTraj = useMemo(() => {
    const all = data.teams.map((t) => trajectory(data.players, t.rosterId));
    return [0, 1, 2, 3].map((i) => all.reduce((s, x) => s + x[i], 0) / all.length);
  }, [data]);

  const ranks = { QB: team.QBRank, RB: team.RBRank, WR: team.WRRank, TE: team.TERank };
  const strengths = [...POSITIONS].sort((a, b) => ranks[a] - ranks[b]).slice(0, 2);
  const needs = [...POSITIONS].sort((a, b) => ranks[b] - ranks[a]).slice(0, 2);
  const grades = [
    ["QB", team.QBRank], ["RB", team.RBRank], ["WR", team.WRRank], ["TE", team.TERank],
    ["PICKS", team.pickValueRank], ["OVERALL", team.totalValueRank],
  ];
  const myPicks = data.picks.filter((k) => k.owner === team.rosterId);
  const pickSeasons = [...new Set(myPicks.map((k) => k.season))].sort().slice(0, 3);
  const isMe = team.rosterId === data.me;

  // ---- Trade strategy ----
  const lookToTrade = useMemo(() => {
    const surplus = roster.filter((p) => strengths.includes(p.pos) && !stars.includes(p.id) && p.value > 0);
    const bench = surplus.filter((p) => !starters.has(p.id));
    const players = (bench.length ? bench : surplus).slice(0, 3).map((p) => ({ kind: "player", p }));
    const pick = myPicks.filter((k) => k.round >= 2).sort((a, b) => a.value - b.value)[0];
    return pick ? [...players, { kind: "pick", k: pick }] : players;
  }, [roster, strengths.join(), stars, starters, myPicks]);

  const targets = useMemo(() => {
    const deep = Math.ceil(n / 3);
    const out = [];
    for (const t of data.teams) {
      if (t.rosterId === team.rosterId) continue;
      for (const pos of needs) {
        if (t[`${pos}Rank`] > deep) continue;
        const theirs = Object.values(data.players)
          .filter((p) => p.owner === t.rosterId && p.pos === pos && p.value > 0)
          .sort((a, b) => b.value - a.value);
        // Skip their single best player at the position; the rest is spare depth.
        for (const p of theirs.slice(1, 3)) out.push({ p, from: t });
      }
    }
    return out.sort((a, b) => b.p.value - a.p.value).slice(0, 6);
  }, [data, team.rosterId, needs.join(), n]);

  const suggestions = [
    <>Strongest room is <b>{strengths[0]}</b> ({ordinal(ranks[strengths[0]])} in the league). Treat its depth as trade currency rather than a need.</>,
    <>Clearest gap is <b>{needs[0]}</b> (#{ranks[needs[0]]}). Prioritise upgrades there{needs[1] ? <>, then <b>{needs[1]}</b> (#{ranks[needs[1]]})</> : null}.</>,
    <>Draft capital ranks <b>#{team.pickValueRank}</b> of {n}. {team.pickValueRank <= n / 2 ? "Use it to fill needs directly." : "Consider packaging picks for a proven starter."}</>,
    <>Three-year outlook: <b>{outlook.join(" → ")}</b>. {outlook[2] === "Rebuild" || outlook[2] === "Reload" ? "The core is aging, so sell older pieces while they still hold value." : "The core should hold or grow value."}</>,
  ];

  return (
    <>
      <PageHead title="Team" accent="Blueprint" sub="Archetype, grades, cornerstones, draft capital and trade strategy for any team.">
        <TeamSelect value={team.rosterId} onChange={setTeamId} />
      </PageHead>

      <div className="chip-row">
        {[["Teams", n], ["Format", lg.superflex ? "Superflex" : "1QB"], ["PPR", lg.ppr], ["TE Prem.", lg.tep || "—"], ["Avg age", team.avgAge ?? "—"], ["Roster", `${team.count} players`]].map(([l, v]) => (
          <div className="mini-chip" key={l}><small>{l}</small><b>{v}</b></div>
        ))}
      </div>

      <div className="bp-hero">
        <div className="card bp-archetype">
          <Img src={team.avatar} className="bp-avatar" />
          <div className="muted small">Value archetype</div>
          <div className="bp-big">{team.window}</div>
          <div className="muted small" style={{ marginTop: "0.6rem" }}>Roster archetype</div>
          <div className="bp-mid">{rosterArchetype(ranks)}</div>
          <div className="scale"><div className="scale-marker" style={{ left: `${WINDOW_POS[team.window] ?? 50}%` }} /></div>
          <div className="scale-labels"><span>Contend</span><span>Rebuild</span></div>
        </div>

        <div className="card">
          <div className="card-title"><h3>Positional Grades</h3><span className="muted small">10 = best in league</span></div>
          <div className="grades">
            {grades.map(([label, rank]) => (
              <GradeCircle key={label} label={label} grade={gradeFromRank(rank, n)} rank={rank} total={n} />
            ))}
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Overall is your rank by total value (players + picks), not an average of the grades. Some positions carry far more value than others.
          </p>
        </div>

        <div className="card">
          <div className="card-title"><h3>Share of League</h3></div>
          <div className="share-row">
            <ShareCard kind="value" label="Value share" pct={valueShare.pct} rank={valueShare.rank} />
            <ShareCard kind="production" label="Starter share" pct={starterShare.pct} rank={starterShare.rank} />
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>Starter share counts only the best possible starting lineup by dynasty value, so bench depth is excluded.</p>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-title">
            <h3>Multi-Year Outlook</h3>
            <Legend items={[{ name: team.name, color: "var(--accent)" }, { name: "League avg", color: "var(--muted)" }]} />
          </div>
          <div className="outlook-row">
            {outlook.map((l, i) => (
              <div className="outlook" key={i}>
                <small>Year {i + 1}</small>
                <b style={{ color: OUTLOOK_COLORS[l] }}>{l}</b>
              </div>
            ))}
          </div>
          <TrajectoryChart
            series={[
              { name: team.name, color: "var(--accent)", values: traj },
              { name: "League avg", color: "var(--muted)", values: leagueAvgTraj, dashed: true },
            ]}
          />
          <p className="muted small" style={{ marginBottom: 0 }}>Aging-curve projection: RBs fade fastest after their mid-20s and QBs hold value longest. Use it for planning direction, not as a forecast.</p>
        </div>

        <div className="card">
          <div className="card-title"><h3>Draft Capital</h3><span className="chip accent">#{team.pickValueRank} of {n}</span></div>
          {pickSeasons.length === 0 && <div className="empty">No picks owned in the next three drafts.</div>}
          {pickSeasons.map((s) => (
            <div key={s} style={{ marginBottom: "0.8rem" }}>
              <div className="list-label">{s}</div>
              {myPicks.filter((k) => k.season === s).map((k) => (
                <div className="list-row" key={k.id}>
                  <PickIcon k={k} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{k.label}</b>
                    <span className="muted small" style={{ display: "block" }}>
                      {k.slotLabel ? `${k.officialSlot ? "" : "Proj "}${k.slotLabel}` : "Slot TBD"}{k.traded ? ` · via ${k.originalName}` : ""}
                    </span>
                  </span>
                  <b>{fmt(k.value)}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="card-title">
          <h3>Roster</h3>
          <span className="muted small">
            <Icon name="star" size={13} /> marks a cornerstone you'd never trade. It's saved in this browser and kept out of trade suggestions.
          </span>
        </div>
        {POSITIONS.map((pos) => {
          const list = roster.filter((p) => p.pos === pos);
          if (!list.length) return null;
          return (
            <div key={pos} style={{ marginBottom: "0.9rem" }}>
              <div className="pos-strip-head" style={{ "--c": POS_VAR[pos] }}>
                <b>{pos}</b>
                <span>Rank #{ranks[pos]} · grade {gradeFromRank(ranks[pos], n)}/10</span>
              </div>
              <div className="pcard-strip">
                {list.map((p) => (
                  <PlayerCard key={p.id} p={p} star={stars.includes(p.id)} onStar={toggleStar} badge={starters.has(p.id) ? "Starter" : p.status === "Taxi" ? "Taxi" : null} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="dash-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <div className="card-title"><h3>Look to Trade</h3><span className="muted small">Surplus at {strengths.join(" / ")}</span></div>
          {lookToTrade.length === 0 && <div className="empty">No clear surplus right now.</div>}
          {lookToTrade.map((a) => (
            <div className="list-row" key={a.kind === "player" ? a.p.id : a.k.id}>
              {a.kind === "player" ? (
                <>
                  <PlayerMini p={a.p} />
                  <b>{fmt(a.p.value)}</b>
                  {isMe && <Link className="btn" href={`/trade?give=${a.p.id}`}>Shop</Link>}
                </>
              ) : (
                <>
                  <PickIcon k={a.k} />
                  <span style={{ flex: 1 }}><b>{a.k.label}</b><span className="muted small" style={{ display: "block" }}>Lowest-value non-1st pick</span></span>
                  <b>{fmt(a.k.value)}</b>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title"><h3>Players to Target</h3><span className="muted small">Depth at {needs.join(" / ")} on teams strong there</span></div>
          {targets.length === 0 && <div className="empty">No standout targets found.</div>}
          {targets.map(({ p, from }) => (
            <div className="list-row" key={p.id}>
              <PlayerMini p={p} sub={`from ${from.name}`} />
              <b>{fmt(p.value)}</b>
              {isMe && <Link className="btn" href={`/trade?get=${p.id}&partner=${from.rosterId}`}>Trade</Link>}
            </div>
          ))}
        </div>
      </div>

      <div className="card bp-suggest" style={{ marginTop: "1rem" }}>
        <div className="card-title"><h3>GM Suggestions</h3></div>
        <ul>
          {suggestions.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>
    </>
  );
}

function PlayerMini({ p, sub }) {
  const { openPlayer } = useApp();
  return (
    <button className="plink pcell" style={{ flex: 1 }} onClick={() => openPlayer(p.id)}>
      <Img src={p.img} className="headshot" />
      <span style={{ minWidth: 0 }}>
        <span className="pname" style={{ display: "block" }}>{p.name}</span>
        <span className="asset-meta"><Pos pos={p.pos} rank={p.posRank} /><span className="muted small">{sub || p.team}</span></span>
      </span>
    </button>
  );
}
