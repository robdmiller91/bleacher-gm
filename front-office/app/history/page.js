"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Img, PageHead, Pos } from "@/components/ui";
import { POS_VAR, fmt } from "@/lib/model";

function DraftBoard({ draft, history }) {
  const { data, openPlayer } = useApp();
  const n = draft.slots.length || Math.max(...draft.picks.map((p) => p.slot));
  const slots = Array.from({ length: n }, (_, i) => i + 1);
  const slotName = (s) => draft.slots.find((x) => x.slot === s)?.name || `Slot ${s}`;
  const rosterName = (rid) => {
    const p = draft.slots.find((x) => x.rosterId === rid);
    return p?.name || data.teams.find((t) => t.rosterId === rid)?.name || `Roster ${rid}`;
  };
  const rounds = Array.from({ length: draft.rounds }, (_, i) => i + 1);
  const cell = (r, s) => draft.picks.find((p) => p.round === r && p.slot === s);

  const hits = draft.picks
    .filter((p) => p.playerId && data.players[p.playerId]?.value)
    .map((p) => ({ ...p, value: data.players[p.playerId].value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <>
      {hits.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="card-title"><h3>Best value today from this draft</h3><span className="muted small">current FantasyCalc value</span></div>
          <div className="hit-row">
            {hits.map((p) => (
              <button key={p.pickNo} className="plink hit" onClick={() => openPlayer(p.playerId)} style={{ "--c": POS_VAR[p.pos] || "var(--k)" }}>
                <Img src={data.players[p.playerId]?.img || p.img} />
                <span className="pname">{p.name}</span>
                <span className="muted small">Pick {p.round}.{String(p.pickNo - (p.round - 1) * n).padStart(2, "0")} · {rosterName(p.rosterId)}</span>
                <b>{fmt(p.value)}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="board-scroll">
        <div className="board" style={{ gridTemplateColumns: `repeat(${n}, minmax(138px, 1fr))` }}>
          {slots.map((s) => <div key={`h${s}`} className="board-head">{slotName(s)}</div>)}
          {rounds.flatMap((r) =>
            slots.map((s) => {
              const p = cell(r, s);
              if (!p) return <div key={`${r}-${s}`} className="board-cell empty">—</div>;
              const now = p.playerId ? data.players[p.playerId] : null;
              return (
                <button
                  key={`${r}-${s}`}
                  className="board-cell plink"
                  style={{ "--c": POS_VAR[p.pos] || "var(--k)" }}
                  onClick={() => (now ? openPlayer(p.playerId) : null)}
                  title={now ? `Open ${p.name}` : p.name}
                >
                  <span className="board-text">
                    <span className="board-row1">
                      <span className="board-name">{p.name}</span>
                      <span className="board-no">{r}.{String(p.pickNo - (r - 1) * n).padStart(2, "0")}</span>
                    </span>
                    <span className="board-meta">{p.pos} · {p.team || "—"}{now?.value ? ` · ${fmt(now.value)}` : ""}</span>
                    {p.traded && <span className="board-arrow">→ {rosterName(p.rosterId)}</span>}
                  </span>
                  <span className="board-photo"><Img src={now?.img || p.img} /></span>
                </button>
              );
            }),
          )}
        </div>
      </div>
      <p className="muted small">Columns show each slot's original owner. → means the pick was traded and shows who made the selection. The number after the team is the player's dynasty value today.</p>
    </>
  );
}

function TradeCard({ t, managers, valueOf }) {
  const { openPlayer, data } = useApp();
  const nowName = (ownerId) => managers.find((m) => m.ownerId === ownerId)?.name;
  const totals = t.sides.map((s) => s.players.reduce((a, p) => a + (valueOf.player(p.id) || 0), 0) + s.picks.reduce((a, k) => a + (valueOf.pick(k)?.value || 0), 0));
  const best = Math.max(...totals);
  const sum = totals.reduce((a, b) => a + b, 0);
  return (
    <div className="card trade-hist">
      <div className="card-title">
        <h3>{t.season} · {t.week === 0 ? "Offseason" : `Week ${t.week}`}</h3>
        <span className="muted small">{t.created ? new Date(t.created).toLocaleDateString() : ""}</span>
      </div>
      <div className="trade-hist-grid" style={{ gridTemplateColumns: `repeat(${t.sides.length}, minmax(0, 1fr))` }}>
        {t.sides.map((s, i) => {
          const now = nowName(s.ownerId);
          return (
            <div key={s.rosterId} className={`trade-side${totals[i] === best && sum > 0 && t.sides.length > 1 ? " winner" : ""}`}>
              <h4>
                <span>{s.nameThen}{now && now !== s.nameThen ? <span className="muted"> (now {now})</span> : null} received</span>
                <span>{fmt(totals[i])}</span>
              </h4>
              {s.players.map((p) => {
                const v = valueOf.player(p.id);
                return (
                  <button key={p.id} className="plink list-row" style={{ width: "100%" }} onClick={() => data.players[p.id] && openPlayer(p.id)}>
                    <Img src={data.players[p.id]?.img || p.img} className="avatar" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="pname" style={{ display: "block" }}>{p.name}</span>
                      <span className="asset-meta"><Pos pos={p.pos || "NA"} /><span className="muted small">{p.from ? `from ${p.from}` : ""}</span></span>
                    </span>
                    <b className="small">{v ? fmt(v) : "—"}</b>
                  </button>
                );
              })}
              {s.picks.map((k, j) => {
                const v = valueOf.pick(k);
                return (
                  <div key={j} className="list-row">
                    <span className="pick-icon" style={{ width: 30, height: 30, fontSize: "0.55rem" }}>{String(k.season).slice(2)}<br />R{k.round}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b className="small">{k.season} Round {k.round}</b>
                      <span className="muted small" style={{ display: "block" }}>
                        {k.originalName !== s.nameThen ? `${k.originalName}'s pick` : "Own pick"}{v?.became ? ` → ${v.became}` : ""}
                      </span>
                    </span>
                    <b className="small">{v?.value ? fmt(v.value) : "—"}</b>
                  </div>
                );
              })}
              {!s.players.length && !s.picks.length && <div className="muted small">Nothing received</div>}
            </div>
          );
        })}
      </div>
      {sum > 0 && t.sides.length === 2 && (
        <div className="split">
          <div style={{ width: `${(totals[0] / sum) * 100}%`, background: "var(--accent)" }} />
          <div style={{ width: `${(totals[1] / sum) * 100}%`, background: "var(--rb)" }} />
        </div>
      )}
    </div>
  );
}

export default function History() {
  const { data, leagueQuery } = useApp();
  const [hist, setHist] = useState(null);
  const [view, setView] = useState("drafts");
  const [draftIdx, setDraftIdx] = useState(0);
  const [teamFilter, setTeamFilter] = useState("all");
  const [seasonFilter, setSeasonFilter] = useState("all");

  useEffect(() => {
    fetch(`/api/history?${leagueQuery}`)
      .then((r) => r.json())
      .then(setHist)
      .catch((e) => setHist({ error: String(e) }));
  }, [leagueQuery]);

  const myOwner = data.teams.find((t) => t.rosterId === data.me)?.ownerId;

  const valueOf = useMemo(() => {
    const player = (id) => data.players[id]?.value || 0;
    const pick = (k) => {
      const became = hist?.pickBecame?.[`${k.season}-${k.round}-${k.original}`];
      if (became) return { value: player(became.id), became: became.name };
      const future = data.picks.find((x) => x.id === `pk-${k.season}-${k.round}-${k.original}`);
      return future ? { value: future.value } : null;
    };
    return { player, pick };
  }, [data, hist]);

  if (!hist) {
    return (
      <>
        <PageHead title="League" accent="History" sub="Loading every season from Sleeper…" />
        <div className="skeleton" style={{ height: 420 }} />
      </>
    );
  }
  if (hist.error) return <div className="card empty">Couldn't load league history: {hist.error}</div>;

  const trades = hist.trades.filter(
    (t) => (teamFilter === "all" || t.sides.some((s) => s.ownerId === teamFilter)) && (seasonFilter === "all" || t.season === Number(seasonFilter)),
  );
  const draft = hist.drafts[draftIdx];

  return (
    <>
      <PageHead title="League" accent="History" sub={`${hist.seasons.length} season${hist.seasons.length === 1 ? "" : "s"} · ${hist.drafts.length} drafts · ${hist.trades.length} trades`}>
        <div className="seg">
          <button className={view === "drafts" ? "on" : ""} onClick={() => setView("drafts")}>Drafts</button>
          <button className={view === "trades" ? "on" : ""} onClick={() => setView("trades")}>Trades</button>
        </div>
        {view === "drafts" ? (
          <select className="select" value={draftIdx} onChange={(e) => setDraftIdx(Number(e.target.value))}>
            {hist.drafts.map((d, i) => <option key={d.draftId} value={i}>{d.label}</option>)}
          </select>
        ) : (
          <>
            <select className="select" value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}>
              <option value="all">All seasons</option>
              {hist.seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="all">All teams</option>
              {hist.managers.map((m) => <option key={m.ownerId} value={m.ownerId}>{m.name}{m.ownerId === myOwner ? " (you)" : ""}</option>)}
            </select>
          </>
        )}
      </PageHead>

      {view === "drafts" ? (
        draft ? <DraftBoard key={draft.draftId} draft={draft} history={hist} /> : <div className="card empty">No completed drafts found.</div>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Totals are what each side's haul is worth <b>today</b>: current FantasyCalc values, with traded picks valued as the player they became (or the pick's current value if it hasn't been used). The highlighted side is ahead now.
          </p>
          {trades.length === 0 && <div className="card empty">No trades match these filters.</div>}
          {trades.map((t) => <TradeCard key={t.id} t={t} managers={hist.managers} valueOf={valueOf} />)}
        </>
      )}
    </>
  );
}
