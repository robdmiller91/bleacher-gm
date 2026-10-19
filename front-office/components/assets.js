"use client";

import { useState } from "react";
import { useApp } from "./AppShell";
import { Img, Pos } from "./ui";
import { fmt } from "@/lib/model";

export function PickIcon({ k, size = 38 }) {
  return (
    <span className="pick-icon" style={{ width: size, height: size }}>
      {String(k.season).slice(2)}
      <br />R{k.round}
    </span>
  );
}

export function AssetRow({ a, on, onClick }) {
  const { openPlayer } = useApp();
  return (
    <button className={`asset${on ? " on" : ""}`} onClick={onClick}>
      {a.kind === "player" ? <Img src={a.p.img} className="headshot" /> : <PickIcon k={a.k} />}
      <span style={{ minWidth: 0 }}>
        <span className="pname" style={{ display: "block", fontSize: "0.84rem" }}>{a.label}</span>
        <span className="asset-meta">
          {a.kind === "player" ? (
            <>
              <Pos pos={a.p.pos} rank={a.p.posRank} />
              <span
                className="muted small"
                style={{ textDecoration: "underline dotted", cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  openPlayer(a.id);
                }}
              >
                {a.p.team} · details
              </span>
            </>
          ) : (
            <span className="muted small">{a.sub}</span>
          )}
        </span>
      </span>
      <span className="asset-val">{fmt(a.value)}</span>
    </button>
  );
}

export function AssetPanel({ title, assets, selected, toggle, header }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const match = (a) => a.label.toLowerCase().includes(q.toLowerCase()) || (a.sub || "").toLowerCase().includes(q.toLowerCase());
  const players = kind === "picks" ? [] : assets.players.filter(match);
  const picks = kind === "players" ? [] : assets.picks.filter(match);
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: "0.6rem" }}>
        <h3>{title}</h3>
        <div className="seg">
          {[["all", "All"], ["players", "Players"], ["picks", `Picks (${assets.picks.length})`]].map(([k, l]) => (
            <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
      </div>
      {header}
      <input className="input" style={{ width: "100%", margin: "0.4rem 0 0.6rem" }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="asset-list">
        {picks.length > 0 && (
          <>
            <div className="list-label">Draft picks</div>
            {picks.map((a) => <AssetRow key={a.id} a={a} on={selected.includes(a.id)} onClick={() => toggle(a.id)} />)}
          </>
        )}
        {players.length > 0 && (
          <>
            <div className="list-label">Players</div>
            {players.map((a) => <AssetRow key={a.id} a={a} on={selected.includes(a.id)} onClick={() => toggle(a.id)} />)}
          </>
        )}
        {!players.length && !picks.length && <div className="empty">Nothing matches.</div>}
      </div>
    </div>
  );
}

