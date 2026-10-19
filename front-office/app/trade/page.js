"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Img, PageHead, Pos } from "@/components/ui";
import { computeTeams, fmt, ordinal } from "@/lib/model";

function assetsFor(data, rosterId) {
  const players = Object.values(data.players)
    .filter((p) => p.owner === rosterId && p.value > 0)
    .map((p) => ({ id: p.id, kind: "player", label: p.name, value: p.value, p }));
  const picks = data.picks
    .filter((k) => k.owner === rosterId)
    .map((k) => ({
      id: k.id,
      kind: "pick",
      label: k.label,
      sub: k.traded ? `via ${k.originalName}` : "Own pick",
      value: k.value,
      k,
    }));
  return [...players, ...picks].sort((a, b) => b.value - a.value);
}

function AssetRow({ a, on, onClick }) {
  const { openPlayer } = useApp();
  return (
    <button className={`asset${on ? " on" : ""}`} onClick={onClick}>
      {a.kind === "player" ? (
        <Img src={a.p.img} className="headshot" />
      ) : (
        <span className="pick-icon">PK</span>
      )}
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
            <>
              <Pos pos="PK" />
              <span className="muted small">{a.sub}</span>
            </>
          )}
        </span>
      </span>
      <span className="asset-val">{fmt(a.value)}</span>
    </button>
  );
}

function AssetPanel({ title, assets, selected, toggle, header }) {
  const [q, setQ] = useState("");
  const shown = assets.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: "0.6rem" }}><h3>{title}</h3></div>
      {header}
      <input className="input" style={{ width: "100%", margin: "0.4rem 0 0.6rem" }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="asset-list">
        {shown.map((a) => <AssetRow key={a.id} a={a} on={selected.includes(a.id)} onClick={() => toggle(a.id)} />)}
      </div>
    </div>
  );
}

export default function Trade() {
  const { data, openPlayer } = useApp();
  const me = data.me ?? data.teams[0].rosterId;
  const others = data.teams.filter((t) => t.rosterId !== me);
  const [partner, setPartner] = useState(others[0]?.rosterId);
  const [give, setGive] = useState([]);
  const [get, setGet] = useState([]);

  // Deep links from the player view: /trade?give=ID or /trade?get=ID&partner=RID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pr = Number(params.get("partner"));
    if (pr && pr !== me) setPartner(pr);
    if (params.get("give")) setGive([params.get("give")]);
    if (params.get("get")) setGet([params.get("get")]);
  }, [me]);

  const myAssets = useMemo(() => assetsFor(data, me), [data, me]);
  const theirAssets = useMemo(() => assetsFor(data, partner), [data, partner]);
  const toggle = (setter) => (id) => setter((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const giveAssets = myAssets.filter((a) => give.includes(a.id));
  const getAssets = theirAssets.filter((a) => get.includes(a.id));
  const giveTotal = giveAssets.reduce((s, a) => s + a.value, 0);
  const getTotal = getAssets.reduce((s, a) => s + a.value, 0);
  const diff = getTotal - giveTotal;
  const bigger = Math.max(giveTotal, getTotal, 1);
  const pct = diff / bigger;

  // Re-rank every team with the trade applied.
  const after = useMemo(() => {
    if (!giveAssets.length && !getAssets.length) return null;
    const players = { ...data.players };
    const picks = data.picks.map((k) => ({ ...k }));
    const move = (a, to) => {
      if (a.kind === "player") players[a.id] = { ...players[a.id], owner: to };
      else picks.find((k) => k.id === a.id).owner = to;
    };
    giveAssets.forEach((a) => move(a, partner));
    getAssets.forEach((a) => move(a, me));
    return computeTeams(data.teams, players, picks);
  }, [data, giveAssets, getAssets, partner, me]);

  const verdict = !giveAssets.length || !getAssets.length
    ? "Add assets to both sides"
    : Math.abs(pct) < 0.05
      ? "Fair trade"
      : diff > 0
        ? `You win by ${fmt(diff)}`
        : `You overpay by ${fmt(-diff)}`;
  const verdictColor = !giveAssets.length || !getAssets.length ? "var(--muted)" : Math.abs(pct) < 0.05 ? "var(--accent)" : diff > 0 ? "var(--good)" : "var(--bad)";

  const IMPACT = [
    ["Overall", "totalValueRank"],
    ["QB", "QBRank"],
    ["RB", "RBRank"],
    ["WR", "WRRank"],
    ["TE", "TERank"],
    ["Picks", "pickValueRank"],
  ];
  const teamRow = (list, rid) => list?.find((t) => t.rosterId === rid);
  const myNow = teamRow(data.teams, me);
  const theirNow = teamRow(data.teams, partner);
  const myAfter = teamRow(after, me);
  const theirAfter = teamRow(after, partner);
  const cell = (now, aft, key) => {
    if (!aft) return [<td key="a" className="c">{ordinal(now[key])}</td>, <td key="b" className="c muted">—</td>];
    const d = now[key] - aft[key];
    return [
      <td key="a" className="c">{ordinal(now[key])}</td>,
      <td key="b" className={`c ${d > 0 ? "delta-up" : d < 0 ? "delta-down" : ""}`}>
        {ordinal(aft[key])} {d ? `(${d > 0 ? "▲" : "▼"}${Math.abs(d)})` : ""}
      </td>,
    ];
  };

  const Side = ({ title, list, total, remove }) => (
    <div className="trade-side">
      <h4><span>{title}</span><span>{fmt(total)}</span></h4>
      {list.length === 0 && <div className="muted small">Pick assets from the list.</div>}
      {list.map((a) => (
        <div className="trade-chip" key={a.id}>
          {a.kind === "player" ? <Img src={a.p.img} className="avatar" /> : <span className="pick-icon" style={{ width: 30, height: 30 }}>PK</span>}
          <span style={{ minWidth: 0 }}>
            {a.kind === "player" ? (
              <button className="plink" onClick={() => openPlayer(a.id)}><span className="pname" style={{ display: "block", fontSize: "0.82rem" }}>{a.label}</span></button>
            ) : (
              <span className="pname" style={{ display: "block", fontSize: "0.82rem" }}>{a.label}</span>
            )}
            <span className="muted small">{fmt(a.value)}</span>
          </span>
          <button className="x" onClick={() => remove(a.id)} aria-label="Remove">×</button>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <PageHead title="Trade" accent="Calculator" sub="FantasyCalc dynasty values plus pick values from your league's real ownership. Totals are raw sums, with no extra credit for consolidating several pieces into one.">
        <span className="chip">{data.league.superflex ? "Superflex" : "1QB"}</span>
        <span className="chip">{data.league.ppr} PPR</span>
        <span className="chip">{data.league.numTeams} teams</span>
        {(give.length > 0 || get.length > 0) && <button className="btn" onClick={() => { setGive([]); setGet([]); }}>Clear</button>}
      </PageHead>

      <div className="trade-layout">
        <AssetPanel title="My Team" assets={myAssets} selected={give} toggle={toggle(setGive)} />

        <div className="grid">
          <div className="card">
            <div className="trade-sides">
              <Side title="You send" list={giveAssets} total={giveTotal} remove={(id) => setGive((l) => l.filter((x) => x !== id))} />
              <Side title="You receive" list={getAssets} total={getTotal} remove={(id) => setGet((l) => l.filter((x) => x !== id))} />
            </div>
            <div className="balance">
              <div className="balance-track">
                <div
                  className="balance-fill"
                  style={{
                    left: diff >= 0 ? "50%" : `${50 + Math.max(-50, pct * 50)}%`,
                    width: `${Math.min(50, Math.abs(pct) * 50)}%`,
                    background: verdictColor,
                  }}
                />
                <div className="balance-mid" />
              </div>
              <div className="verdict" style={{ color: verdictColor }}>{verdict}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><h3>Roster Impact</h3><span className="muted small">League rank before → after</span></div>
            <div className="table-wrap">
              <table className="t impact">
                <thead>
                  <tr>
                    <th />
                    <th className="c" colSpan={2}>{myNow.name}</th>
                    <th className="c" colSpan={2}>{theirNow?.name}</th>
                  </tr>
                  <tr>
                    <th>Rank</th>
                    <th className="c">Now</th><th className="c">After</th>
                    <th className="c">Now</th><th className="c">After</th>
                  </tr>
                </thead>
                <tbody>
                  {IMPACT.map(([label, key]) => (
                    <tr key={key}>
                      <td><b>{label}</b></td>
                      {cell(myNow, myAfter, key)}
                      {theirNow ? cell(theirNow, theirAfter, key) : null}
                    </tr>
                  ))}
                  <tr>
                    <td><b>Window</b></td>
                    <td className="c">{myNow.window}</td>
                    <td className="c">{myAfter?.window || "—"}</td>
                    <td className="c">{theirNow?.window}</td>
                    <td className="c">{theirAfter?.window || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <AssetPanel
          title="Their Team"
          assets={theirAssets}
          selected={get}
          toggle={toggle(setGet)}
          header={
            <select className="select" style={{ width: "100%" }} value={partner} onChange={(e) => { setPartner(Number(e.target.value)); setGet([]); }}>
              {others.map((t) => <option key={t.rosterId} value={t.rosterId}>{t.name}</option>)}
            </select>
          }
        />
      </div>
    </>
  );
}
