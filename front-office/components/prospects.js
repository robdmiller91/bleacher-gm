"use client";

import { useMemo, useState } from "react";
import { Pos } from "./ui";
import { fmt, heightLabel } from "@/lib/model";
import {
  BLEND_TEXT, BREAKOUT_LABEL, HYPE_GAP, blendText, METRICS, OUTCOMES, PROSPECT_CLASS, PROSPECT_TIERS, ROUND_BUCKETS, ROUND_LABELS, UNRANKED_RANK,
  closestProfiles, dominatorOf, gradeTone, letter, outcomeBucket, outcomeMix, tierRoundGrid,
} from "@/lib/prospects";

const initials = (name) => name.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
const shortName = (name) => {
  const [first, ...rest] = name.split(" ");
  return `${first[0]}. ${rest.join(" ")}`;
};
const isPast = (x) => x.pick != null;
const roundLabel = (x) => (isPast(x) ? `Round ${x.draftRound}` : x.round ? ROUND_LABELS[x.round] : "Unranked");
const ageLabel = (x, v) => `${v.toFixed(1)}${x.dobKnown ? "" : " est."}`;
// Rounds aren't a fixed 32 picks (compensatory picks), so show the round and overall pick.
const pickLabel = (x) => (isPast(x) ? `Rd ${x.draftRound} · #${x.pick}` : "TBD");
const rateColor = (p) => (p >= 50 ? "var(--good)" : p >= 25 ? "var(--pk)" : "var(--bad)");

export function TierBadge({ tier, small }) {
  return (
    <span className={`px-tier${small ? " small" : ""}`} style={{ "--t": tier.color }}>
      {tier.key}
    </span>
  );
}

export function OutcomeBadge({ x }) {
  const b = outcomeBucket(x);
  const early = !x.outcome.complete && b.key === "miss";
  return (
    <span className="px-outcome" style={{ "--o": early ? "var(--muted)" : b.color }} title={x.outcome.best ? `Best career finish: ${x.pos}${x.outcome.best}` : "No NFL fantasy stats"}>
      {x.outcome.label.text}
    </span>
  );
}

function HypeBadge({ x }) {
  const tone = x.hype.key === "model" ? "var(--good)" : x.hype.key === "hype" ? "var(--bad)" : "var(--muted)";
  return <span className="px-outcome" style={{ "--o": tone }} title={`Profile ${x.profile.toFixed(2)} vs draft capital ${x.capital.toFixed(1)}`}>{x.hype.label}</span>;
}

function Monogram({ x, size = 64 }) {
  return (
    <span className="px-mono" style={{ "--s": x.color, width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(x.name)}
    </span>
  );
}

export function GradeBar({ grade, compare }) {
  return (
    <span className="px-bar">
      <i style={{ width: `${(grade ?? 0) * 10}%`, background: gradeTone(grade) }} />
      {compare != null && <b style={{ left: `${compare * 10}%` }} title={`Comparison: ${compare}`} />}
    </span>
  );
}

// Grades on a spider chart; a second profile overlays as a dashed outline.
function Radar({ metrics, other }) {
  const list = metrics.filter((m) => m.grade != null);
  if (list.length < 3) return null;
  const R = 92;
  const C = 130;
  const pt = (i, g) => {
    const a = (Math.PI * 2 * i) / list.length - Math.PI / 2;
    return [C + Math.cos(a) * R * (g / 10), C + Math.sin(a) * R * (g / 10)];
  };
  const poly = (gs) => gs.map((g, i) => pt(i, g ?? 0).join(",")).join(" ");
  return (
    <svg viewBox="0 0 260 260" className="px-radar" role="img" aria-label="Grade profile">
      {[2.5, 5, 7.5, 10].map((g) => (
        <polygon key={g} points={poly(list.map(() => g))} fill="none" stroke="var(--border)" />
      ))}
      {list.map((m, i) => {
        const [x, y] = pt(i, 10);
        const [lx, ly] = pt(i, 12.2);
        return (
          <g key={m.key}>
            <line x1={C} y1={C} x2={x} y2={y} stroke="var(--border)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="var(--muted)">
              {m.label.toUpperCase()}
            </text>
          </g>
        );
      })}
      {other && (
        <polygon points={poly(list.map((m) => other.grades[m.key]))} fill="none" stroke="var(--text)" strokeWidth="1.5" strokeDasharray="4 3" />
      )}
      <polygon points={poly(list.map((m) => m.grade))} fill="color-mix(in srgb, var(--good) 22%, transparent)" stroke="var(--good)" strokeWidth="2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Class board: featured #1 plus tiles in rookie-draft order
// ---------------------------------------------------------------------------

function BoardTile({ x, featured, onOpen }) {
  return (
    <button className={`px-tile${featured ? " featured" : ""}`} onClick={() => onOpen(x.id)}>
      <div className="px-tile-head">
        <span>{shortName(x.name)}</span>
        <b>{x.overall.toFixed(1)}</b>
      </div>
      <div className="px-tile-body" style={{ "--s": x.color }}>
        <span className="px-tile-slot">{x.slot}</span>
        <span className="px-tile-pos"><Pos pos={x.pos} rank={x.posRank} /></span>
        <span className="px-tile-mono">{initials(x.name)}</span>
        <span className="px-tile-school">{x.school}{isPast(x) ? ` · pick ${x.pick}` : ""}</span>
        {isPast(x) && <span className="px-tile-outcome"><OutcomeBadge x={x} /></span>}
      </div>
      <div className="px-tile-tier" style={{ background: x.tier.color }}>{x.tier.key}</div>
    </button>
  );
}

export function BoardView({ list, year, onOpen }) {
  if (!list.length) return <div className="card empty">No prospects at this position.</div>;
  const [first, ...rest] = list;
  const topTier = list.filter((x) => x.tier.key === PROSPECT_TIERS[0].key).length;
  return (
    <div className="grid">
      <div className="px-class-head">
        <h2><span>{year}</span> Rookie Class</h2>
        <div className="px-kpis">
          <div><small>Prospects</small><b>{list.length}</b></div>
          <div><small>Top Z-Score</small><b>{Math.max(...list.map((x) => x.z)).toFixed(2)}</b></div>
          <div><small>{PROSPECT_TIERS[0].key}</small><b>{topTier}</b></div>
        </div>
      </div>
      <div className="px-board">
        <BoardTile x={first} featured onOpen={onOpen} />
        {rest.slice(0, 47).map((x) => <BoardTile key={x.id} x={x} onOpen={onOpen} />)}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Slots are a 12-team rookie draft in BGM Prospect Score order{year === PROSPECT_CLASS ? "" : ", graded as the class looked before its draft, with the actual pick as draft capital"}.
        {list.length > 48 ? " The board shows the top 48; see Rankings for everyone." : ""} Click a prospect for the full report card.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rankings table with filters and three column sets
// ---------------------------------------------------------------------------

const sumKey = (x, k) => x.seasons.reduce((s, r) => s + (r[k] || 0), 0);
const peakDom = (x) => {
  const v = x.seasons.map((s) => dominatorOf(x.pos, s)).filter((d) => d != null);
  return v.length ? Math.max(...v) : null;
};

const OVERVIEW_COLS = [
  { key: "posRank", label: "Pos Rk", get: (x) => x.posRank, show: (x) => `${x.pos}${x.posRank}`, asc: true },
  { key: "tier", label: "Tier", get: (x) => x.overall, show: (x) => <TierBadge tier={x.tier} small /> },
  { key: "overall", label: "Overall", get: (x) => x.overall, show: (x) => <b className="px-num">{x.overall.toFixed(1)}</b> },
  { key: "profile", label: "Grade", get: (x) => x.profile, show: (x) => <span style={{ color: gradeTone(x.profile), fontWeight: 600 }}>{x.profile.toFixed(2)}</span> },
  { key: "z", label: "Z", get: (x) => x.z, show: (x) => x.z.toFixed(2) },
  { key: "hype", label: "Model vs Hype", get: (x) => x.hype.gap, show: (x) => <HypeBadge x={x} /> },
  { key: "archetype", label: "Archetype", get: (x) => x.archetype, show: (x) => x.archetype },
  { key: "build", label: "Build", get: (x) => x.build, show: (x) => x.build },
  { key: "height", label: "Ht", get: (x) => x.height, show: (x) => heightLabel(x.height) },
  { key: "weight", label: "Wt", get: (x) => x.weight, show: (x) => x.weight ?? "—" },
  { key: "forty", label: "40", get: (x) => x.forty, show: (x) => (x.forty ? x.forty.toFixed(2) : "—"), asc: true },
  { key: "draftAge", label: "Draft Age", get: (x) => x.draftAge, show: (x) => ageLabel(x, x.draftAge), asc: true },
];
const FUTURE_COLS = [
  { key: "round", label: "Proj Round", get: (x) => x.boardRank || UNRANKED_RANK, show: roundLabel, asc: true },
];
const PAST_COLS = [
  { key: "pick", label: "Pick", get: (x) => x.pick, show: pickLabel, asc: true },
  { key: "outcome", label: "NFL Outcome", get: (x) => -(x.outcome.best4 ?? 999), show: (x) => <OutcomeBadge x={x} /> },
];
const PRODUCTION_COLS = [
  { key: "dom", label: "Peak Dom", get: peakDom, show: (x) => (peakDom(x) == null ? "—" : `${(peakDom(x) * 100).toFixed(1)}%`) },
  { key: "passYds", label: "Pass Yds", get: (x) => sumKey(x, "passYds"), show: (x) => fmt(sumKey(x, "passYds")) },
  { key: "passTd", label: "Pass TD", get: (x) => sumKey(x, "passTd"), show: (x) => sumKey(x, "passTd") },
  { key: "passInt", label: "INT", get: (x) => sumKey(x, "passInt"), show: (x) => sumKey(x, "passInt"), asc: true },
  { key: "rushYds", label: "Rush Yds", get: (x) => sumKey(x, "rushYds"), show: (x) => fmt(sumKey(x, "rushYds")) },
  { key: "rushTd", label: "Rush TD", get: (x) => sumKey(x, "rushTd"), show: (x) => sumKey(x, "rushTd") },
  { key: "rec", label: "Rec", get: (x) => sumKey(x, "rec"), show: (x) => sumKey(x, "rec") },
  { key: "recYds", label: "Rec Yds", get: (x) => sumKey(x, "recYds"), show: (x) => fmt(sumKey(x, "recYds")) },
  { key: "recTd", label: "Rec TD", get: (x) => sumKey(x, "recTd"), show: (x) => sumKey(x, "recTd") },
  { key: "seasons", label: "Seasons", get: (x) => x.seasons.length, show: (x) => x.seasons.length },
];
function inputCols(pos) {
  const base = [
    { key: "profile", label: "Grade", get: (x) => x.profile, show: (x) => x.profile.toFixed(2) },
    { key: "capital", label: "Capital", get: (x) => x.capital, show: (x) => x.capital.toFixed(1) },
  ];
  if (pos === "ALL") {
    return [...base,
      { key: "breakoutAge", label: "Breakout Age", get: (x) => x.breakoutAge, show: (x) => (x.breakoutAge ? ageLabel(x, x.breakoutAge) : "—"), asc: true },
      { key: "draftAge", label: "Draft Age", get: (x) => x.draftAge, show: (x) => ageLabel(x, x.draftAge), asc: true },
    ];
  }
  return [...base, ...METRICS[pos].map((m) => ({
    key: m.key, label: m.label,
    get: (x) => x.grades[m.key],
    show: (x) => {
      const mm = x.metrics.find((y) => y.key === m.key);
      return mm.grade == null ? "—" : <span title={mm.fmt(mm.value)} style={{ color: gradeTone(mm.grade), fontWeight: 600 }}>{mm.grade.toFixed(1)}</span>;
    },
  }))];
}

function Select({ value, onChange, all, options }) {
  return (
    <select className={`select${value ? " px-on" : ""}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function RankingsView({ list, pos, past, onOpen }) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [arch, setArch] = useState("");
  const [build, setBuild] = useState("");
  const [round, setRound] = useState("");
  const [cols, setCols] = useState("overview");
  const [sort, setSort] = useState({ key: "overall", asc: false });

  const columns = useMemo(
    () => (cols === "overview" ? [...OVERVIEW_COLS, ...(past ? PAST_COLS : FUTURE_COLS)] : cols === "production" ? PRODUCTION_COLS : inputCols(pos)),
    [cols, past, pos],
  );
  const options = (f) => [...new Set(list.map(f))].sort();
  const roundOptions = past
    ? [1, 2, 3, 4, 5, 6, 7].map((r) => `Round ${r}`)
    : [...ROUND_BUCKETS.map((r) => ROUND_LABELS[r]), "Unranked"];
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = list.filter((x) =>
      (!term || `${x.name} ${x.school}`.toLowerCase().includes(term)) &&
      (!tier || x.tier.key === tier) && (!arch || x.archetype === arch) && (!build || x.build === build) &&
      (!round || roundLabel(x) === round));
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return out;
    const dir = sort.asc ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir || b.overall - a.overall;
    });
  }, [list, q, tier, arch, build, round, sort, columns]);

  const clickSort = (c) => setSort((s) => (s.key === c.key ? { key: c.key, asc: !s.asc } : { key: c.key, asc: !!c.asc }));
  const filtered = q || tier || arch || build || round;
  const clear = () => [setQ, setTier, setArch, setBuild, setRound].forEach((f) => f(""));

  return (
    <div className="card" style={{ padding: "0.9rem 1rem" }}>
      <div className="px-filters">
        <input className="input" placeholder="Filter by name or school" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={tier} onChange={setTier} all="All tiers" options={PROSPECT_TIERS.map((t) => t.key).filter((t) => list.some((x) => x.tier.key === t))} />
        <Select value={arch} onChange={setArch} all="All archetypes" options={options((x) => x.archetype)} />
        <Select value={build} onChange={setBuild} all="All builds" options={options((x) => x.build)} />
        <Select value={round} onChange={setRound} all="All rounds" options={roundOptions.filter((r) => list.some((x) => roundLabel(x) === r))} />
        {filtered && <button className="btn" onClick={clear}>Clear</button>}
      </div>
      <div className="px-filters" style={{ justifyContent: "space-between" }}>
        <div className="seg">
          {[["overview", "Overview"], ["production", "Production"], ["inputs", "Model inputs"]].map(([k, l]) => (
            <button key={k} className={cols === k ? "on" : ""} onClick={() => setCols(k)}>{l}</button>
          ))}
        </div>
        <span className="muted small">{rows.length} prospects{cols === "production" ? " · college career totals" : ""}</span>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th className="rnk">#</th>
              <th>Player</th>
              <th>School</th>
              <th className="c">Class</th>
              {columns.map((c) => (
                <th key={c.key} className={`c sortable${sort.key === c.key ? " sorted" : ""}`} onClick={() => clickSort(c)}>
                  {c.label} {sort.key === c.key ? (sort.asc ? "↑" : "↓") : "↕"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className="px-row" style={{ "--t": x.tier.color }} onClick={() => onOpen(x.id)}>
                <td className="rnk">{x.rank}</td>
                <td>
                  <button className="plink pcell" onClick={() => onOpen(x.id)} title={`Open ${x.name}`}>
                    <Monogram x={x} size={34} />
                    <span className="pname">{x.name}</span>
                  </button>
                </td>
                <td><span className="px-school"><i style={{ background: x.color }} />{x.school}</span></td>
                <td className="c">{x.classShort}</td>
                {columns.map((c) => <td key={c.key} className="c">{c.show(x)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No prospects match these filters.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report card
// ---------------------------------------------------------------------------

function RateBars({ pos, h }) {
  return [["top12", 1], ["top24", 2], ["top36", 3]].map(([k, n]) => (
    <div key={k} className="px-hit">
      <span>{pos}{n}</span>
      <span className="px-bar"><i style={{ width: `${h[k]}%`, background: rateColor(h[k]) }} /></span>
      <b>{h[k]}%</b>
    </div>
  ));
}

function HitRatePanel({ x, hitRates, tierHits }) {
  const bucket = x.round || "R6-7";
  const byRound = hitRates[x.pos]?.[bucket];
  const byTier = tierHits[x.pos]?.[x.tier.key];
  const [mode, setMode] = useState("tier");
  const h = mode === "tier" ? byTier : byRound;
  return (
    <div className="card px-panel">
      <div className="px-panel-head">
        <h3>Hit Rate</h3>
        <div className="seg">
          <button className={mode === "tier" ? "on" : ""} onClick={() => setMode("tier")}>{x.tier.key} tier</button>
          <button className={mode === "round" ? "on" : ""} onClick={() => setMode("round")}>{ROUND_LABELS[bucket]}</button>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        {mode === "tier"
          ? `Past ${x.pos}s our model put in the ${x.tier.key} tier (drafted 2018–2022)`
          : `${x.pos}s drafted in ${ROUND_LABELS[bucket]}, 2012–2021${x.round ? "" : " (closest match for an unranked prospect)"}`}
        {h ? ` · ${h.n} players` : ""}. Share with a top-12 / 24 / 36 PPR season in their first four years.
      </p>
      {h ? <RateBars pos={x.pos} h={h} /> : <div className="empty">No past {x.pos}s in this {mode === "tier" ? "tier" : "round"} yet.</div>}
      {h && h.n < 5 && <p className="muted small">Fewer than 5 players: treat this as an anecdote, not a rate.</p>}
      {isPast(x) && (
        <div className="px-mini" style={{ marginTop: "0.8rem" }}>
          <div><small>NFL outcome</small><b><OutcomeBadge x={x} /></b></div>
          <div><small>Best career finish</small><b>{x.outcome.best ? `${x.pos}${x.outcome.best}` : "—"}</b></div>
          <div><small>Top-24 seasons</small><b>{x.outcome.top24} of {x.outcome.seasons}</b></div>
        </div>
      )}
    </div>
  );
}

function HypePanel({ x }) {
  const msg = {
    model: `His production profile (${x.profile.toFixed(2)}) grades well above his ${isPast(x) ? "draft slot" : "big-board"} capital (${x.capital.toFixed(1)}). The model likes him more than the market does.`,
    hype: `His ${isPast(x) ? "draft slot" : "big-board"} capital (${x.capital.toFixed(1)}) is well ahead of his production profile (${x.profile.toFixed(2)}). The market likes him more than the numbers do.`,
    aligned: `Profile (${x.profile.toFixed(2)}) and ${isPast(x) ? "draft" : "board"} capital (${x.capital.toFixed(1)}) are within ${HYPE_GAP} points of each other.`,
  }[x.hype.key];
  return (
    <div className="px-hype">
      <HypeBadge x={x} />
      <span className="small">{msg}</span>
    </div>
  );
}

function SeasonTable({ x }) {
  const qb = x.pos === "QB";
  return (
    <div className="card px-panel">
      <div className="px-panel-head"><h3>College Production</h3><span>Team games · share of team totals</span></div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Season</th><th>School</th><th className="c">G</th>
              {qb && <><th className="c">Cmp/Att</th><th className="c">Pass Yds</th><th className="c">TD</th><th className="c">INT</th><th className="c">AY/A</th></>}
              <th className="c">Rush</th><th className="c">Rush Yds</th><th className="c">Rush TD</th>
              {!qb && <><th className="c">Rec</th><th className="c">Rec Yds</th><th className="c">Rec TD</th></>}
              <th className="c">{qb ? "Pass Share" : "Dominator"}</th>
            </tr>
          </thead>
          <tbody>
            {x.seasons.map((s) => {
              const d = dominatorOf(x.pos, s);
              return (
                <tr key={s.season + s.school}>
                  <td>{s.season}{s.season === x.breakoutSeason ? <span className="chip accent" style={{ marginLeft: 6 }}>Breakout</span> : null}</td>
                  <td>{s.school}</td>
                  <td className="c">{s.games ?? "—"}</td>
                  {qb && <><td className="c">{s.passCmp}/{s.passAtt}</td><td className="c">{fmt(s.passYds)}</td><td className="c">{s.passTd}</td><td className="c">{s.passInt}</td><td className="c">{s.aya != null ? s.aya.toFixed(2) : "—"}</td></>}
                  <td className="c">{s.rushAtt}</td><td className="c">{fmt(s.rushYds)}</td><td className="c">{s.rushTd}</td>
                  {!qb && <><td className="c">{s.rec}</td><td className="c">{fmt(s.recYds)}</td><td className="c">{s.recTd}</td></>}
                  <td className="c">{d != null ? `${(d * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        {isPast(x) ? "College seasons before the draft." : `${PROSPECT_CLASS - 1} is the season in progress.`} G is team games, since player game counts aren't in the source data.
      </p>
    </div>
  );
}

function CompRow({ y, d, vs, setVs, onOpen, sub }) {
  return (
    <div className="px-comp">
      <button className="plink pcell" onClick={() => onOpen(y.id)}>
        <Monogram x={y} size={36} />
        <span>
          <span className="pname" style={{ display: "block" }}>{y.name} <span className="muted small">{y.draftYear}</span></span>
          <span className="muted small">{sub} · distance {d.toFixed(2)}</span>
        </span>
      </button>
      {isPast(y) ? <OutcomeBadge x={y} /> : <TierBadge tier={y.tier} small />}
      <b className="px-num">{y.overall.toFixed(1)}</b>
      <button className={`px-vs${vs === y.id ? " on" : ""}`} onClick={() => setVs(vs === y.id ? null : y.id)} title={`Compare with ${y.name}`}>VS</button>
    </div>
  );
}

export function ReportCard({ x, classList, history, hitRates, tierHits, onOpen, onBack }) {
  const [vs, setVs] = useState(null);
  const everyone = useMemo(() => [...classList, ...history], [classList, history]);
  const other = vs ? everyone.find((y) => y.id === vs) : null;
  const classComps = closestProfiles(x, classList);
  const pastComps = closestProfiles(x, history.filter((y) => y.draftYear !== x.draftYear), 6);
  const [first, ...rest] = x.name.split(" ");
  const bio = [
    ["Class", x.classYear],
    ["Draft Age", ageLabel(x, x.draftAge)],
    ["Age Today", ageLabel(x, x.ageToday)],
    ["Height", heightLabel(x.height)],
    ["Weight", x.weight ? `${x.weight} lb` : "—"],
    ["40 Time", x.forty ? x.forty.toFixed(2) : "—"],
    ["Build", x.build],
    ["Archetype", x.archetype],
    ["Breakout", x.breakoutSeason ? `${x.breakoutSeason} (age ${ageLabel(x, x.breakoutAge)})` : "None"],
    [isPast(x) ? "Draft Round" : "Proj. Round", roundLabel(x)],
    ["Draft Pick", pickLabel(x)],
    [isPast(x) ? "NFL Seasons" : "Big Board", isPast(x) ? x.outcome.seasons : x.boardRank ? `#${x.boardRank}` : "Unranked"],
  ];

  return (
    <div className="grid px-report">
      <button className="link px-back" onClick={onBack}>← {x.draftYear} board</button>

      <div className="px-hero" style={{ "--s": x.color }}>
        <div>
          <span className="px-first">{first}</span>
          <h2>{rest.join(" ")}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <TierBadge tier={x.tier} />
            {isPast(x) && <OutcomeBadge x={x} />}
          </div>
        </div>
        <Monogram x={x} size={150} />
      </div>

      <div className="px-strip" style={{ "--s": x.color }}>
        <div className="px-strip-school">
          <b>{x.school}</b>
          <small>{x.draftYear} · {x.classShort}</small>
        </div>
        <div className="hl"><small>Overall</small><b>{x.overall.toFixed(1)}</b></div>
        <div><small>{x.pos} Grade</small><b>{x.profile.toFixed(2)}</b></div>
        <div><small>Z-Score</small><b>{x.z.toFixed(2)}</b></div>
        <div><small>Class Rank</small><b>{x.pos}{x.posRank}</b></div>
        <div><small>Rookie Slot</small><b>{x.slot}</b></div>
      </div>

      <div className="px-bio" style={{ "--s": x.color }}>
        {bio.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
      </div>

      <HypePanel x={x} />

      <div className="px-two">
        <div className="card px-panel">
          <div className="px-panel-head">
            <h3>Grades</h3>
            <span>{other ? `vs ${other.name} ${other.draftYear} (dashed)` : "Stat · grade · letter"}</span>
          </div>
          <div className="px-grades-wrap">
            <div className="px-grades">
              {x.metrics.map((m) => (
                <div key={m.key} className="px-grade" title={m.note}>
                  <span>{m.label}</span>
                  <GradeBar grade={m.grade} compare={other?.grades[m.key]} />
                  <span className="muted small">{m.fmt(m.value)}</span>
                  <b>{m.grade == null ? "—" : m.grade.toFixed(1)}</b>
                  <em style={{ color: gradeTone(m.grade) }}>{m.grade == null ? "" : letter(m.grade)}</em>
                </div>
              ))}
            </div>
            <Radar metrics={x.metrics} other={other} />
          </div>
        </div>
        <HitRatePanel x={x} hitRates={hitRates} tierHits={tierHits} />
      </div>

      <div className="px-two">
        <div className="card px-panel">
          <div className="px-panel-head"><h3>Historical Comps</h3><span>Closest past {x.pos} profiles · how they turned out</span></div>
          {pastComps.length === 0 && <div className="empty">No past {x.pos}s with enough data to compare.</div>}
          {pastComps.map(({ y, d }) => (
            <CompRow key={y.id} y={y} d={d} vs={vs} setVs={setVs} onOpen={onOpen} sub={`${y.school} · pick ${y.pick}`} />
          ))}
        </div>
        <div className="card px-panel">
          <div className="px-panel-head"><h3>Closest in Class</h3><span>{x.draftYear} {x.pos}s · select VS to compare</span></div>
          {classComps.length === 0 && <div className="empty">No other {x.pos}s in this class.</div>}
          {classComps.map(({ y, d }) => (
            <CompRow key={y.id} y={y} d={d} vs={vs} setVs={setVs} onOpen={onOpen} sub={`${y.school} · ${y.archetype}`} />
          ))}
        </div>
      </div>

      <SeasonTable x={x} />

      <div className="card px-panel">
        <div className="px-panel-head"><h3>Notes</h3><span>Data caveats</span></div>
        <ul className="px-notes">
          {x.notes && <li>{x.notes}</li>}
          {!x.dobKnown && <li>No published birthdate found, so ages assume 18.6 at the start of his first college season ({x.firstSeason}).</li>}
          {!x.forty && <li>No verified 40 time{isPast(x) ? " (didn't run at the combine)" : " yet"}. Speed Score is left out of his grade.</li>}
          {!isPast(x) && !x.boardRank && <li>Not on the Tankathon big board, so draft capital is priced like pick {UNRANKED_RANK}.</li>}
          <li>Overall for a {x.pos} = {blendText(x.pos)}, on a 0–100 scale.{isPast(x) ? " Past classes use the actual draft pick." : ""}</li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hit rates: tier × round grid, outcome mix, model vs hype, round table
// ---------------------------------------------------------------------------

export function HitRatesView({ history, hitRates, hypeCard, pos }) {
  const [finish, setFinish] = useState(24);
  const P = pos === "ALL" ? "" : pos;
  const grid = useMemo(() => tierRoundGrid(history, pos, finish), [history, pos, finish]);
  const mix = useMemo(() => outcomeMix(history, pos), [history, pos]);
  const tiers = PROSPECT_TIERS.filter((t) => mix[t.key]);
  const positions = pos === "ALL" ? Object.keys(METRICS) : [pos];

  return (
    <div className="grid">
      <div className="card">
        <div className="card-title">
          <h3>By tier and draft round{P ? ` · ${P}s` : ""}</h3>
          <div className="seg">
            {[12, 24, 36].map((n) => (
              <button key={n} className={finish === n ? "on" : ""} onClick={() => setFinish(n)}>Top {n}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="t px-grid">
            <thead>
              <tr><th>Tier</th>{[1, 2, 3, 4, 5, 6, 7].map((r) => <th key={r} className="c">Rd {r}</th>)}</tr>
            </thead>
            <tbody>
              {PROSPECT_TIERS.map((t) => (
                <tr key={t.key}>
                  <td><TierBadge tier={t} small /></td>
                  {[1, 2, 3, 4, 5, 6, 7].map((r) => {
                    const c = grid[`${t.key}|${r}`];
                    if (!c) return <td key={r} className="c muted">—</td>;
                    const p = Math.round((c.hits / c.n) * 100);
                    return (
                      <td key={r} className="c">
                        <span className={`px-cell${c.n < 3 ? " faded" : ""}`} style={{ "--o": rateColor(p) }}>
                          <b>{p}%</b><small>{c.hits} of {c.n}</small>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Share of past prospects (drafted 2018–2022) with a top-{finish} {P || "positional"} season in their first four years, by our tier and the round they were actually drafted in.
          Faded cells have fewer than 3 players: anecdotes, not rates.
        </p>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Outcome by tier</h3>
          <div className="px-legend">{OUTCOMES.map((o) => <span key={o.key}><i style={{ background: o.color }} />{o.label}</span>)}</div>
        </div>
        {tiers.map((t) => {
          const m = mix[t.key];
          return (
            <div key={t.key} className="px-mix">
              <TierBadge tier={t} small />
              <span className="muted small">{m.n}</span>
              <span className="px-stack">
                {OUTCOMES.map((o) => (m[o.key] ? <i key={o.key} style={{ width: `${(m[o.key] / m.n) * 100}%`, background: o.color }} title={`${o.label}: ${m[o.key]} of ${m.n}`} /> : null))}
              </span>
              {OUTCOMES.map((o) => <span key={o.key} className="px-mix-pct">{Math.round((m[o.key] / m.n) * 100)}%</span>)}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title"><h3>Model vs hype: who was right?</h3><span className="muted small">Top-24 rate, drafted 2018–2022</span></div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Position</th><th className="c">Model &gt; hype</th><th className="c">Aligned</th><th className="c">Hype &gt; model</th></tr></thead>
            <tbody>
              {positions.map((Q) => (
                <tr key={Q}>
                  <td><b>{Q}</b></td>
                  {["model", "aligned", "hype"].map((k) => {
                    const a = hypeCard[Q]?.[k];
                    if (!a) return <td key={k} className="c muted">—</td>;
                    const p = Math.round((a.hits / a.n) * 100);
                    return <td key={k} className="c"><b style={{ color: rateColor(p) }}>{p}%</b> <span className="muted small">{a.hits} of {a.n}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          "Model &gt; hype" means the production grade was at least {HYPE_GAP} points above the draft-slot grade. Read across a row to see whether the numbers or the draft room called it better.
        </p>
      </div>

      {positions.map((Q) => (
        <div key={Q} className="card">
          <div className="card-title"><h3>{Q} hit rates by draft round</h3><span className="muted small">Drafted 2012–2021 · first four NFL seasons</span></div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr><th>Round</th><th className="c">Players</th>{[1, 2, 3].map((n) => <th key={n}>{Q}{n} (top {n * 12})</th>)}</tr>
              </thead>
              <tbody>
                {ROUND_BUCKETS.map((r) => {
                  const h = hitRates[Q]?.[r];
                  if (!h) return null;
                  return (
                    <tr key={r}>
                      <td><b>{ROUND_LABELS[r]}</b></td>
                      <td className="c">{h.n}</td>
                      {["top12", "top24", "top36"].map((k) => (
                        <td key={k}>
                          <div className="px-hit compact">
                            <span className="px-bar"><i style={{ width: `${h[k]}%`, background: rateColor(h[k]) }} /></span>
                            <b>{h[k]}%</b>
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="muted small" style={{ margin: 0 }}>
        A hit is at least one season finishing top 12 / 24 / 36 at the position in full-PPR points, counted over the draft year and the three seasons after it.
        NFL data from nflverse (CC BY 4.0). Small samples, especially first-round TEs and second-round QBs, swing a lot.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glossary: searchable cards per position
// ---------------------------------------------------------------------------

const GENERAL_TERMS = [
  ["Overall", `A blend of the position grade and the draft-capital grade on a 0–100 scale: ${BLEND_TEXT}. The mix was set by testing which one best separated hits from misses among 2018–22 draftees. This is what tiers and class order use.`],
  ["Position grade", "The weighted average of a prospect's 0–10 input grades (see the inputs below). Inputs with no data are left out and the rest re-weighted."],
  ["Draft capital", `A 0–10 grade from draft position on a log scale: #1 = 10, #32 = 8, #64 = 6.5, #100 = 5, #150 = 3.5. The coming class uses its Tankathon big-board rank; past classes use the actual pick. Unranked prospects are priced like #${UNRANKED_RANK}.`],
  ["Model vs hype", `Compares the production grade with the draft-capital grade. A gap of ${HYPE_GAP}+ either way flags where the model and the market disagree.`],
  ["Z-score", "How many standard deviations a prospect's overall sits above the average at his position in his class."],
  ["Class rank", "Position rank within the draft class by overall."],
  ["Rookie slot", "Where he'd go in a 12-team rookie draft taken in overall order."],
  ["Tier", PROSPECT_TIERS.map((t) => `${t.key} ${t.min ? `${t.min}+` : `under ${PROSPECT_TIERS[PROSPECT_TIERS.length - 2].min}`}`).join(" · ")],
  ["Dominator", "A player's share of his team's production in a season. Receivers: average of receiving-yard and receiving-TD share. Backs: the same with scrimmage yards and TDs. QBs: share of team passing yards."],
  ["Breakout age", `Age on Sept 1 of the first season a player clears the position's dominator bar (${BREAKOUT_LABEL}).`],
  ["Draft age", "Age on draft day. \"est.\" means no birthdate was found, so 18.6 at the start of his first college season is assumed."],
  ["Speed score", "Weight × 200 ÷ (40 time)⁴. Rewards big players who run fast. Only counted when a verified 40 time exists."],
  ["Projected round", "Big-board rank 1–32 = Round 1, 33–64 = Round 2, 65–100 = Round 3, 101–175 = Rounds 4–5, later = Rounds 6–7."],
  ["NFL outcome", "Best full-PPR positional finish in the draft year and the three seasons after: QB1/RB1/WR1/TE1 = top 12, 2 = top 24, 3 = top 36. \"Too early\" means the four-year window hasn't closed."],
  ["Build", "A size label from height and weight, such as Power or Scatback for backs and Big-bodied X or Slot for receivers."],
  ["Archetype", "A style label from the grade profile, such as Three-down workhorse, Alpha or Dual threat."],
];

export function GlossaryView({ pos }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const positions = pos === "ALL" ? Object.keys(METRICS) : [pos];
  const match = (a, b) => !term || `${a} ${b}`.toLowerCase().includes(term);
  return (
    <div className="grid">
      <input className="input" style={{ maxWidth: 420 }} placeholder="Search terms" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card">
        <div className="card-title"><h3>Tiers</h3><span className="muted small">Best to worst</span></div>
        <div className="px-filters" style={{ marginBottom: 0 }}>{PROSPECT_TIERS.map((t) => <TierBadge key={t.key} tier={t} />)}</div>
      </div>
      <div className="px-terms">
        {GENERAL_TERMS.filter(([a, b]) => match(a, b)).map(([a, b]) => (
          <div key={a} className="px-term"><h4>{a}</h4><p>{b}</p></div>
        ))}
      </div>
      {positions.map((P) => {
        const ms = METRICS[P].filter((m) => match(m.label, m.note));
        if (!ms.length) return null;
        return (
          <div key={P} className="grid">
            <h3 className="px-term-head">{P} inputs</h3>
            <div className="px-terms">
              {ms.map((m) => (
                <div key={m.key} className="px-term">
                  <h4>{m.label} <span className="muted small">{Math.round(m.weight * 100)}% of grade</span></h4>
                  <p>{m.note}</p>
                  <p className="muted small">0 at {m.fmt(m.range[0])} · 10 at {m.fmt(m.range[1])}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="card small muted">
        <b style={{ color: "var(--text)" }}>Sources.</b> College stats and team totals: ESPN's public stats pages. Birthdates: Wikipedia ({PROSPECT_CLASS} class) and nflverse (past classes).
        Big-board ranks: Tankathon's {PROSPECT_CLASS} board (read 26 Oct 2026). Draft picks, combine 40s and NFL fantasy finishes: nflverse (CC BY 4.0).
        Not included: PFF charting stats (missed tackles, yards after contact, route data) and conference-strength adjustments, which aren't in free data.
      </div>
    </div>
  );
}
