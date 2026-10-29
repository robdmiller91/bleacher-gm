"use client";

import { useEffect, useMemo, useState } from "react";
import { Img, Pos } from "./ui";
import { PickIcon } from "./assets";
import { fmt } from "@/lib/model";
import { focusOf, formatDistance, involves, pickValues, suggestTrades, valueTrade } from "@/lib/tradeFinder";

const SOURCE = { league: "Your league", network: "Leaguemate's league", market: "FantasyCalc" };

function ago(ms) {
  const d = (Date.now() - ms) / 86400000;
  if (d < 1) return "Today";
  if (d < 2) return "Yesterday";
  if (d < 30) return `${Math.floor(d)} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AssetLine({ a, focusId, onOpen }) {
  const isPick = a.type === "pick" || a.kind === "pick";
  return (
    <div className={`tf-asset${a.id === focusId ? " focus" : ""}`}>
      {isPick ? <PickIcon k={a.k || a} size={30} /> : <Img src={a.img} className="avatar" />}
      <span className="tf-asset-name">
        {isPick ? <span className="pname">{a.label}</span> : <button className="plink pname" onClick={() => onOpen(a.id)}>{a.label}</button>}
        {!isPick && <span className="muted small">{[a.team, a.pos && a.posRank ? null : a.pos].filter(Boolean).join(" · ")}</span>}
      </span>
      {!isPick && a.pos && a.posRank ? <Pos pos={a.pos} rank={a.posRank} /> : null}
      <b className="tf-val">{a.value == null ? "—" : fmt(a.value)}</b>
    </div>
  );
}

// Share of the combined value on each side, drawn like the calculator's balance bar.
function Balance({ a, b }) {
  const sum = a + b || 1;
  const left = (a / sum) * 100;
  const even = Math.abs(a - b) / Math.max(a, b, 1) < 0.1;
  return (
    <div className="tf-bal" title={even ? "Roughly even today" : "Share of today's value"}>
      <span style={{ width: `${left}%`, background: even ? "var(--accent)" : a > b ? "var(--good)" : "var(--bad)" }} />
      <span style={{ width: `${100 - left}%`, background: even ? "var(--accent)" : b > a ? "var(--good)" : "var(--bad)" }} />
    </div>
  );
}

function TradeCard({ t, focusId, mine, onOpen }) {
  const f = t.format;
  const [a, b] = t.sides;
  return (
    <div className="tf-trade">
      <div className="tf-trade-head">
        <span className={`chip${t.source === "league" ? " accent" : ""}`}>{SOURCE[t.source]}</span>
        <span className="chip">{f.teams || "?"} teams</span>
        <span className="chip">{f.superflex ? "SF" : "1QB"}</span>
        <span className="chip">{f.ppr} PPR{f.tep ? ` · TEP ${f.tep}` : ""}</span>
        {formatDistance(f, mine) === 0 && <span className="chip accent">Same format</span>}
        <span className="muted small tf-date">{ago(t.date)}</span>
      </div>
      {t.sides.length === 2 && <Balance a={a.total} b={b.total} />}
      <div className="tf-sides" style={{ gridTemplateColumns: `repeat(${t.sides.length}, minmax(0, 1fr))` }}>
        {t.sides.map((s, i) => (
          <div key={i} className="tf-side">
            <div className="tf-side-head">
              <span>{s.name ? `${s.name} gets` : `Side ${String.fromCharCode(65 + i)} gets`}</span>
              <b>{fmt(s.total)}{s.partial ? "+" : ""}</b>
            </div>
            {s.assets.map((x, j) => <AssetLine key={j} a={x} focusId={focusId} onOpen={onOpen} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Idea({ s, onLoad, onOpen }) {
  const give = s.give.reduce((n, a) => n + a.value, 0);
  const get = s.get.reduce((n, a) => n + a.value, 0);
  const diff = get - give;
  return (
    <div className="tf-idea">
      <div className="tf-idea-head">
        <b>With {s.partnerName}</b>
        <span className={`small ${Math.abs(diff) / Math.max(give, get, 1) < 0.05 ? "" : diff > 0 ? "delta-up" : "delta-down"}`}>
          {Math.abs(diff) / Math.max(give, get, 1) < 0.05 ? "Even" : diff > 0 ? `+${fmt(diff)} for you` : `${fmt(diff)} for you`}
        </span>
      </div>
      <div className="tf-sides" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="tf-side">
          <div className="tf-side-head"><span>You send</span><b>{fmt(give)}</b></div>
          {s.give.map((a) => <AssetLine key={a.id} a={a} onOpen={onOpen} />)}
        </div>
        <div className="tf-side">
          <div className="tf-side-head"><span>You get</span><b>{fmt(get)}</b></div>
          {s.get.map((a) => <AssetLine key={a.id} a={a} onOpen={onOpen} />)}
        </div>
      </div>
      {s.why && <p className="muted small tf-why">{s.why}</p>}
      <button className="btn tf-load" onClick={() => onLoad(s)}>Load into calculator</button>
    </div>
  );
}

// Bottom of the trade calculator: pick a player or pick, see recent real trades that included it
// and trade ideas with teams in this league.
export default function TradeFinder({ data, me, give, get, leagueQuery, onLoad, onOpen }) {
  const [feed, setFeed] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [search, setSearch] = useState("");
  const [onlyFormat, setOnlyFormat] = useState(false);
  const [shown, setShown] = useState(8);

  useEffect(() => {
    if (!leagueQuery) return;
    let live = true;
    fetch(`/api/trades?${leagueQuery}`)
      .then((r) => r.json())
      .then((d) => live && setFeed(d))
      .catch((e) => live && setFeed({ error: String(e) }));
    return () => {
      live = false;
    };
  }, [leagueQuery]);

  // Default to the first asset in the trade being built.
  const inTrade = [...give, ...get];
  useEffect(() => {
    if (!focusId && inTrade.length) setFocusId(inTrade[0]);
    setShown(8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inTrade.join()]);

  const focus = useMemo(() => focusOf(focusId, data), [focusId, data]);
  const pv = useMemo(() => pickValues(data), [data]);
  const mine = feed?.format || { teams: data.teams.length, superflex: data.league.superflex, ppr: data.league.ppr };

  const trades = useMemo(() => {
    if (!feed?.trades || !focus) return [];
    return feed.trades
      .filter((t) => involves(t, focus) && (!onlyFormat || formatDistance(t.format, mine) === 0))
      // Your league's trades first, then the closest formats, newest first.
      .sort((a, b) => (b.source === "league") - (a.source === "league") || formatDistance(a.format, mine) - formatDistance(b.format, mine) || b.date - a.date)
      .map((t) => valueTrade(t, data, pv));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, focus, onlyFormat, data, pv]);

  const ideas = useMemo(() => suggestTrades(data, me, focus), [data, me, focus]);

  const players = useMemo(
    () => Object.values(data.players).filter((p) => p.value > 0 && p.owner != null).sort((a, b) => b.value - a.value),
    [data],
  );
  const pick = (name) => {
    setSearch(name);
    const p = players.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (p) setFocusId(p.id);
  };
  const ownerName = focus?.owner === me ? "you" : data.teams.find((t) => t.rosterId === focus?.owner)?.name;
  const marketPrice = useMemo(() => {
    // Median of what the other side gave up in recent trades where the focus asset moved alone.
    const solo = trades.filter((t) => t.sides.length === 2 && t.sides.some((s) => s.assets.length === 1 && involves({ sides: [s] }, focus)) && t.sides.every((s) => !s.partial));
    const got = solo.map((t) => t.sides.find((s) => !(s.assets.length === 1 && involves({ sides: [s] }, focus))).total).sort((a, b) => a - b);
    return got.length >= 3 ? { n: got.length, median: got[Math.floor(got.length / 2)] } : null;
  }, [trades, focus]);

  return (
    <div className="card tf">
      <div className="card-title">
        <h3>Trade Finder</h3>
        <span className="muted small">Recent real trades and ideas with teams in your league · values are today's, in your league's format</span>
      </div>

      <div className="tf-pick">
        <span className="muted small">Look up</span>
        {inTrade.map((id) => {
          const f = focusOf(id, data);
          return f ? <button key={id} className={`px-chip${focusId === id ? " on" : ""}`} onClick={() => setFocusId(id)}>{f.label}</button> : null;
        })}
        <input
          className="input tf-search"
          list="tf-players"
          placeholder="Any rostered player…"
          value={search}
          onChange={(e) => pick(e.target.value)}
        />
        <datalist id="tf-players">
          {players.map((p) => <option key={p.id} value={p.name}>{`${p.pos} · ${data.teams.find((t) => t.rosterId === p.owner)?.name || ""}`}</option>)}
        </datalist>
      </div>

      {!focus && <div className="empty muted">Pick a player above, or add players or picks to the calculator, to see recent trades and ideas.</div>}

      {focus && (
        <>
          <div className="tf-focus">
            {focus.kind === "player" ? <Img src={focus.img} className="avatar" /> : <PickIcon k={focus.k} size={36} />}
            <div>
              <b>{focus.label}</b>
              <span className="muted small"> · value {fmt(focus.value)} · owned by {ownerName || "—"}</span>
              {marketPrice && <div className="small">Traded alone {marketPrice.n} times recently for a median of <b>{fmt(marketPrice.median)}</b> in today's value.</div>}
            </div>
          </div>

          <div className="tf-cols">
            <section>
              <div className="tf-col-head">
                <h4>Trade ideas</h4>
                <span className="muted small">{focus.owner === me ? `What teams could send for ${focus.label}` : `What you could offer ${ownerName}`}</span>
              </div>
              {ideas.length === 0 && <div className="muted small">No packages of up to three pieces land within about 10% of this value.</div>}
              {ideas.map((s, i) => <Idea key={i} s={s} onLoad={onLoad} onOpen={onOpen} />)}
            </section>

            <section>
              <div className="tf-col-head">
                <h4>Recent trades</h4>
                <label className="small tf-toggle"><input type="checkbox" checked={onlyFormat} onChange={(e) => setOnlyFormat(e.target.checked)} /> Same format only</label>
              </div>
              {!feed && <div className="skeleton" style={{ height: 220 }} />}
              {feed?.error && <div className="muted small">Couldn't load recent trades: {feed.error}</div>}
              {feed?.trades && trades.length === 0 && (
                <div className="muted small">No trades with {focus.label} in the {feed.trades.length} recent trades found. The feed covers your league's season, the last few weeks in {feed.scanned.leagues} leaguemates' leagues, and FantasyCalc's latest.</div>
              )}
              {trades.slice(0, shown).map((t) => <TradeCard key={t.id} t={t} focusId={focus.id} mine={mine} onOpen={onOpen} />)}
              {trades.length > shown && <button className="btn" onClick={() => setShown((n) => n + 8)}>Show more ({trades.length - shown})</button>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
