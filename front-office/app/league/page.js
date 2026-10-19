"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { Img, PageHead } from "@/components/ui";
import { POS_VAR, fmt } from "@/lib/model";

function Column({ title, rank, color, rows }) {
  const { openPlayer } = useApp();
  return (
    <div>
      <div className="col-head" style={{ background: color }}>
        <span>{title}</span>
        <span>#{rank}</span>
      </div>
      {rows.length === 0 && <div className="col-row muted">None</div>}
      {rows.map((r) =>
        r.p ? (
          <button key={r.id} className="col-row plink" style={{ width: "100%" }} onClick={() => openPlayer(r.id)}>
            <Img src={r.p.img} />
            <span className="pname">{r.p.name}</span>
            <span className="v">{fmt(r.p.value)}</span>
          </button>
        ) : (
          <div key={r.id} className="col-row">
            <span className="pick-icon" style={{ width: 26, height: 26, fontSize: "0.55rem" }}>PK</span>
            <span className="pname">{r.k.label}{r.k.traded ? <span className="muted small"> via {r.k.originalName}</span> : null}</span>
            <span className="v">{fmt(r.k.value)}</span>
          </div>
        ),
      )}
    </div>
  );
}

export default function League() {
  const { data } = useApp();
  const [open, setOpen] = useState(() => new Set(data.me != null ? [data.me] : []));
  const max = Math.max(...data.teams.map((t) => t.totalValue), 1);
  const toggle = (rid) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });

  return (
    <>
      <PageHead title="League" accent="Power Rankings" sub="Total dynasty value: players plus draft capital. Open any franchise to compare position rooms, and click a player for details." />

      {data.teams.map((t) => {
        const segs = [
          ["QB", t.QB, t.QBRank, POS_VAR.QB],
          ["RB", t.RB, t.RBRank, POS_VAR.RB],
          ["WR", t.WR, t.WRRank, POS_VAR.WR],
          ["TE", t.TE, t.TERank, POS_VAR.TE],
          ["PK", t.pickValue, t.pickValueRank, POS_VAR.PK],
        ];
        const isOpen = open.has(t.rosterId);
        const roster = Object.values(data.players).filter((p) => p.owner === t.rosterId).sort((a, b) => b.value - a.value);
        const col = (pos) => roster.filter((p) => p.pos === pos).slice(0, 8).map((p) => ({ id: p.id, p }));
        const picks = data.picks.filter((k) => k.owner === t.rosterId).map((k) => ({ id: k.id, k }));
        return (
          <div key={t.rosterId} className="card franchise" style={t.rosterId === data.me ? { borderColor: "var(--accent)" } : undefined}>
            <button className="franchise-head" onClick={() => toggle(t.rosterId)}>
              <span className="rank-box">{t.totalValueRank}</span>
              <Img src={t.avatar} className="avatar" />
              <span style={{ minWidth: 0 }}>
                <span className="pname" style={{ display: "block" }}>{t.name}</span>
                <span className="muted small">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ""} · age {t.avgAge ?? "—"}</span>
              </span>
              <div className="stack" style={{ width: `${Math.max(35, (t.totalValue / max) * 100)}%` }}>
                {segs.map(([label, v, rank, color]) => (
                  <div key={label} title={`${label}: ${fmt(v)} (#${rank})`} style={{ flex: Math.max(v, 1), background: color }}>{rank}</div>
                ))}
              </div>
              <span className="chip accent hide-sm">{t.window}</span>
              <b>{fmt(t.totalValue)}</b>
            </button>
            {isOpen && (
              <div className="franchise-body">
                <Column title="QB" rank={t.QBRank} color={POS_VAR.QB} rows={col("QB")} />
                <Column title="RB" rank={t.RBRank} color={POS_VAR.RB} rows={col("RB")} />
                <Column title="WR" rank={t.WRRank} color={POS_VAR.WR} rows={col("WR")} />
                <Column title="TE" rank={t.TERank} color={POS_VAR.TE} rows={col("TE")} />
                <Column title="PICKS" rank={t.pickValueRank} color={POS_VAR.PK} rows={picks} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
