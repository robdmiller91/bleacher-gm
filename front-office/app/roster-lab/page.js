"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Img, PageHead, Pos, TeamSelect } from "@/components/ui";
import { Legend, ShareCard, TrajectoryChart } from "@/components/charts";
import { PickIcon } from "@/components/assets";
import {
  POSITIONS, applyMoves, fmt, ordinal, pickAsset, playerAsset, shareOf, starterValueTotals, trajectory,
} from "@/lib/model";

function AssetPicker({ label, pool, selected, onAdd, onRemove, teamName }) {
  const { openPlayer } = useApp();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const term = q.trim().toLowerCase();
  const results = pool
    .filter((a) => !selected.some((s) => s.id === a.id))
    .filter((a) => !term || `${a.label} ${a.sub || ""} ${a.p?.team || ""} ${teamName(a.owner)}`.toLowerCase().includes(term))
    .slice(0, 40);
  const total = selected.reduce((s, a) => s + a.value, 0);
  return (
    <div className="card">
      <div className="card-title"><h3>{label}</h3><b>{fmt(total)}</b></div>
      <div className="search" style={{ maxWidth: "none", margin: 0 }}>
        <input
          value={q}
          placeholder="Search players, picks or teams…"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ paddingLeft: "1rem" }}
        />
        {open && results.length > 0 && (
          <div className="search-results" style={{ maxHeight: 360, overflowY: "auto" }}>
            {results.map((a) => (
              <button key={a.id} className="search-item" onMouseDown={() => { onAdd(a); setQ(""); }}>
                {a.kind === "player" ? <Img src={a.p.img} className="headshot" /> : <PickIcon k={a.k} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="pname" style={{ display: "block" }}>{a.label}</span>
                  <span className="asset-meta">
                    {a.kind === "player" ? <Pos pos={a.p.pos} rank={a.p.posRank} /> : <Pos pos="PK" />}
                    <span className="muted small">
                      {a.kind === "pick" ? `${a.sub} · ` : ""}{a.owner ? teamName(a.owner) : a.p?.yearsExp === 0 ? "Unrostered rookie" : "Free agent"}
                    </span>
                  </span>
                </span>
                <b className="small">{fmt(a.value)}</b>
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop: "0.7rem" }}>
        {selected.length === 0 && <div className="muted small">Nothing added yet.</div>}
        {selected.map((a) => (
          <div className="trade-chip" key={a.id}>
            {a.kind === "player" ? <Img src={a.p.img} className="avatar" /> : <PickIcon k={a.k} size={30} />}
            <span style={{ minWidth: 0 }}>
              {a.kind === "player" ? (
                <button className="plink" onClick={() => openPlayer(a.id)}><span className="pname" style={{ display: "block", fontSize: "0.82rem" }}>{a.label}</span></button>
              ) : (
                <span className="pname" style={{ display: "block", fontSize: "0.82rem" }}>{a.label}</span>
              )}
              <span className="muted small">{fmt(a.value)} · {a.owner ? teamName(a.owner) : "Free agent"}</span>
            </span>
            <button className="x" onClick={() => onRemove(a.id)} aria-label="Remove">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Delta({ before, after, lowerIsBetter = true, format = (v) => v }) {
  if (after == null || before === after) return <span className="muted">{format(before)}</span>;
  const better = lowerIsBetter ? after < before : after > before;
  return (
    <span>
      <span className="muted" style={{ textDecoration: "line-through", marginRight: 6 }}>{format(before)}</span>
      <b className={better ? "up" : "down"}>{format(after)}</b>
    </span>
  );
}

function ImpactPanel({ data, rosterId, after, afterPlayers }) {
  const now = data.teams.find((t) => t.rosterId === rosterId);
  const aft = after?.find((t) => t.rosterId === rosterId);
  const rp = data.league.rosterPositions;
  const valueNow = shareOf(Object.fromEntries(data.teams.map((t) => [t.rosterId, t.totalValue])), rosterId);
  const valueAft = after ? shareOf(Object.fromEntries(after.map((t) => [t.rosterId, t.totalValue])), rosterId) : null;
  const startNow = shareOf(starterValueTotals(data.teams, data.players, rp), rosterId);
  const startAft = after ? shareOf(starterValueTotals(after, afterPlayers, rp), rosterId) : null;
  const rows = [
    ["Overall rank", "totalValueRank", true, ordinal],
    ["Total value", "totalValue", false, fmt],
    ["Player value", "playerValue", false, fmt],
    ["Pick value", "pickValue", false, fmt],
    ...POSITIONS.map((p) => [`${p} rank`, `${p}Rank`, true, ordinal]),
    ["Picks rank", "pickValueRank", true, ordinal],
    ["Avg age", "avgAge", true, (v) => v ?? "—"],
  ];
  return (
    <div className="dash-grid" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", marginTop: 0 }}>
      <div className="card">
        <div className="card-title">
          <h3>{now.name}</h3>
          <span className="chip accent">{now.window}{aft && aft.window !== now.window ? ` → ${aft.window}` : ""}</span>
        </div>
        <table className="t">
          <tbody>
            {rows.map(([label, key, lower, f]) => (
              <tr key={key}>
                <td className="muted">{label}</td>
                <td style={{ textAlign: "right" }}><Delta before={now[key]} after={aft?.[key]} lowerIsBetter={lower} format={f} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-title"><h3>Share of League</h3></div>
        <div className="share-row">
          <ShareCard kind="value" label="Value share" pct={valueNow.pct} rank={valueNow.rank} after={valueAft} />
          <ShareCard kind="production" label="Starter share" pct={startNow.pct} rank={startNow.rank} after={startAft} />
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Starter share is the value in each team's best possible lineup, which is a proxy for how much weekly firepower it has.</p>
      </div>
    </div>
  );
}

export default function RosterLab() {
  const { data } = useApp();
  const [me, setMe] = useState(data.me ?? data.teams[0].rosterId);
  const [partner, setPartner] = useState(0);
  const [give, setGive] = useState([]);
  const [get, setGet] = useState([]);
  const [tab, setTab] = useState("me");
  const teamName = (rid) => data.teams.find((t) => t.rosterId === rid)?.name || "";

  const givePool = useMemo(
    () => [
      ...Object.values(data.players).filter((p) => p.owner === me && p.value > 0).sort((a, b) => b.value - a.value).map(playerAsset),
      ...data.picks.filter((k) => k.owner === me).map(pickAsset),
    ],
    [data, me],
  );
  const getPool = useMemo(() => {
    const ok = (owner) => (partner ? owner === partner : owner !== me);
    return [
      ...Object.values(data.players).filter((p) => p.value > 0 && ok(p.owner)).sort((a, b) => b.value - a.value).map(playerAsset),
      ...data.picks.filter((k) => ok(k.owner)).map(pickAsset),
    ];
  }, [data, me, partner]);

  const result = useMemo(
    () => (give.length || get.length ? applyMoves(data, give, get, me, partner || null) : null),
    [data, give, get, me, partner],
  );

  const trajNow = useMemo(() => trajectory(data.players, me), [data, me]);
  const trajAfter = result ? trajectory(result.players, me) : trajNow;
  const giveTotal = give.reduce((s, a) => s + a.value, 0);
  const getTotal = get.reduce((s, a) => s + a.value, 0);
  const net = getTotal - giveTotal;

  const newIds = new Set(get.map((a) => a.id));
  const goneIds = new Set(give.map((a) => a.id));
  const projected = Object.values((result || data).players)
    .filter((p) => p.owner === me || goneIds.has(p.id))
    .sort((a, b) => b.value - a.value);

  const reset = () => {
    setGive([]);
    setGet([]);
  };

  return (
    <>
      <PageHead title="Roster" accent="Lab" sub="Try hypothetical moves, including free agents and unrostered rookies, and see your rank, shares and three-year trajectory shift. Nothing is saved or sent anywhere.">
        <TeamSelect value={me} onChange={(v) => { setMe(v); reset(); setPartner(0); }} />
        <select className="select" value={partner} onChange={(e) => { setPartner(Number(e.target.value)); setGet([]); setTab("me"); }}>
          <option value={0}>No partner (one-sided sandbox)</option>
          {data.teams.filter((t) => t.rosterId !== me).map((t) => <option key={t.rosterId} value={t.rosterId}>Partner: {t.name}</option>)}
        </select>
        {(give.length > 0 || get.length > 0) && <button className="btn" onClick={reset}>Reset</button>}
      </PageHead>

      <div className="dash-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 0 }}>
        <AssetPicker
          label="Give up"
          pool={givePool}
          selected={give}
          onAdd={(a) => setGive((l) => [...l, a])}
          onRemove={(id) => setGive((l) => l.filter((a) => a.id !== id))}
          teamName={teamName}
        />
        <AssetPicker
          label={partner ? `Acquire from ${teamName(partner)}` : "Acquire (any team or free agent)"}
          pool={getPool}
          selected={get}
          onAdd={(a) => setGet((l) => [...l, a])}
          onRemove={(id) => setGet((l) => l.filter((a) => a.id !== id))}
          teamName={teamName}
        />
      </div>

      <div className="card net-bar">
        <span>Sending <b>{fmt(giveTotal)}</b></span>
        <span>Receiving <b>{fmt(getTotal)}</b></span>
        <span className={net > 0 ? "up" : net < 0 ? "down" : "muted"} style={{ fontSize: "1.1rem" }}>
          Net {net > 0 ? "+" : ""}{fmt(net)}
        </span>
        {!partner && give.length > 0 && <span className="muted small">With no partner selected, assets you give up simply leave the league.</span>}
      </div>

      {partner ? (
        <div className="seg" style={{ margin: "1rem 0 0.8rem" }}>
          <button className={tab === "me" ? "on" : ""} onClick={() => setTab("me")}>{teamName(me)}</button>
          <button className={tab === "partner" ? "on" : ""} onClick={() => setTab("partner")}>{teamName(partner)}</button>
        </div>
      ) : (
        <div style={{ height: "1rem" }} />
      )}
      <ImpactPanel data={data} rosterId={tab === "partner" && partner ? partner : me} after={result?.teams} afterPlayers={result?.players} />

      <div className="dash-grid">
        <div className="card">
          <div className="card-title">
            <h3>Multi-Year Outlook</h3>
            <Legend items={[{ name: "Current roster", color: "var(--muted)" }, { name: "With these moves", color: "var(--accent)" }]} />
          </div>
          <TrajectoryChart
            series={[
              { name: "Current roster", color: "var(--muted)", values: trajNow, dashed: true },
              { name: "With these moves", color: "var(--accent)", values: trajAfter },
            ]}
          />
          <div className="outlook-row" style={{ marginTop: "0.4rem" }}>
            {trajAfter.slice(1).map((v, i) => {
              const d = v - trajNow[i + 1];
              return (
                <div className="outlook" key={i}>
                  <small>+{i + 1} yr</small>
                  <b>{fmt(v)}</b>
                  <span className={d > 0 ? "up small" : d < 0 ? "down small" : "muted small"}>{d ? `${d > 0 ? "+" : ""}${fmt(d)}` : "no change"}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-title"><h3>Projected Roster</h3><span className="muted small">{projected.filter((p) => !goneIds.has(p.id)).length} players</span></div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {projected.map((p) => (
              <div className="list-row" key={p.id} style={goneIds.has(p.id) ? { opacity: 0.45, textDecoration: "line-through" } : undefined}>
                <Img src={p.img} className="avatar" />
                <span style={{ flex: 1, minWidth: 0 }} className="pname">{p.name}</span>
                <Pos pos={p.pos} />
                {newIds.has(p.id) && <span className="chip accent">New</span>}
                <b className="small" style={{ width: 56, textAlign: "right" }}>{fmt(p.value)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
