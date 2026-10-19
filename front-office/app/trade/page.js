"use client";

import { useEffect, useMemo } from "react";
import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { Img, PageHead } from "@/components/ui";
import { AssetPanel, PickIcon } from "@/components/assets";
import { applyMoves, fmt, ordinal, teamAssets } from "@/lib/model";

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

  const myAssets = useMemo(() => teamAssets(data, me), [data, me]);
  const theirAssets = useMemo(() => teamAssets(data, partner), [data, partner]);
  const toggle = (setter) => (id) => setter((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const allMine = [...myAssets.players, ...myAssets.picks];
  const allTheirs = [...theirAssets.players, ...theirAssets.picks];
  const giveAssets = allMine.filter((a) => give.includes(a.id));
  const getAssets = allTheirs.filter((a) => get.includes(a.id));
  const giveTotal = giveAssets.reduce((s, a) => s + a.value, 0);
  const getTotal = getAssets.reduce((s, a) => s + a.value, 0);
  const diff = getTotal - giveTotal;
  const pct = diff / Math.max(giveTotal, getTotal, 1);

  const after = useMemo(
    () => (giveAssets.length || getAssets.length ? applyMoves(data, giveAssets, getAssets, me, partner).teams : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, give.join(), get.join(), partner, me],
  );

  const ready = giveAssets.length && getAssets.length;
  const verdict = !ready ? "Add assets to both sides" : Math.abs(pct) < 0.05 ? "Fair trade" : diff > 0 ? `You win by ${fmt(diff)}` : `You overpay by ${fmt(-diff)}`;
  const verdictColor = !ready ? "var(--muted)" : Math.abs(pct) < 0.05 ? "var(--accent)" : diff > 0 ? "var(--good)" : "var(--bad)";
  const pickSources = new Set([...giveAssets, ...getAssets].filter((a) => a.kind === "pick").map((a) => a.k.valueSource));

  const IMPACT = [["Overall", "totalValueRank"], ["QB", "QBRank"], ["RB", "RBRank"], ["WR", "WRRank"], ["TE", "TERank"], ["Picks", "pickValueRank"]];
  const row = (list, rid) => list?.find((t) => t.rosterId === rid);
  const myNow = row(data.teams, me);
  const theirNow = row(data.teams, partner);
  const myAfter = row(after, me);
  const theirAfter = row(after, partner);
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

  const side = (title, list, total, remove) => (
    <div className="trade-side">
      <h4><span>{title}</span><span>{fmt(total)}</span></h4>
      {list.length === 0 && <div className="muted small">Pick players or draft picks from the list.</div>}
      {list.map((a) => (
        <div className="trade-chip" key={a.id}>
          {a.kind === "player" ? <Img src={a.p.img} className="avatar" /> : <PickIcon k={a.k} size={30} />}
          <span style={{ minWidth: 0 }}>
            {a.kind === "player" ? (
              <button className="plink" onClick={() => openPlayer(a.id)}><span className="pname" style={{ display: "block", fontSize: "0.82rem" }}>{a.label}</span></button>
            ) : (
              <span className="pname" style={{ display: "block", fontSize: "0.82rem" }}>{a.label}</span>
            )}
            <span className="muted small">{fmt(a.value)}{a.kind === "pick" ? ` · ${a.sub}` : ""}</span>
          </span>
          <button className="x" onClick={() => remove(a.id)} aria-label="Remove">×</button>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <PageHead title="Trade" accent="Calculator" sub="Players and draft picks on the same FantasyCalc dynasty scale. Totals are raw sums, with no extra credit for consolidating several pieces into one.">
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
              {side("You send", giveAssets, giveTotal, (id) => setGive((l) => l.filter((x) => x !== id)))}
              {side("You receive", getAssets, getTotal, (id) => setGet((l) => l.filter((x) => x !== id)))}
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
              {pickSources.size > 0 && (
                <p className="muted small" style={{ textAlign: "center", margin: "0.4rem 0 0" }}>
                  {pickSources.has("Model")
                    ? "Some pick values use our round and slot model because FantasyCalc doesn't list that pick."
                    : "Pick values are FantasyCalc market prices, matched to each pick's projected slot."}
                </p>
              )}
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
