"use client";

import { useMemo, useState } from "react";
import { Pos } from "./ui";
import { fmt, heightLabel } from "@/lib/model";
import {
  BREAKOUT_LABEL, HYPE_GAP, METRICS, OUTCOMES, PROSPECT_CLASS, PROSPECT_TIERS, ROOM_WEIGHT, ROUND_BUCKETS, ROUND_LABELS, TIER_CUTS, UNRANKED_RANK,
  closestProfiles, dominatorOf, gradeFormula, gradeTone, letter, outcomeBucket, outcomeMix, tierRoundGrid,
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
      {tier.label || tier.key}
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

// Headshot when we have one (Sleeper, for players now in the NFL), otherwise school-colored initials.
export function Monogram({ x, size = 64 }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="px-mono" style={{ "--s": x.color, width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {x.img && !broken ? <img src={x.img} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials(x.name)}
    </span>
  );
}

// Projected (or actual) draft slot as a label, the way scouts talk about it.
const slotLabel = (pick) =>
  !pick ? "Unranked" : pick <= 10 ? "Top 10" : pick <= 32 ? "1st Round" : pick <= 64 ? "2nd Round" : pick <= 100 ? "3rd Round" : "Day 3";
const predraftLabel = (x) => slotLabel(isPast(x) ? x.pick : x.boardRank);

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
  const [broken, setBroken] = useState(false);
  return (
    <button className={`px-tile${featured ? " featured" : ""}`} onClick={() => onOpen(x.id)}>
      <div className="px-tile-head" style={{ "--t": x.tier.color }}>
        <span>{shortName(x.name)}</span>
        <b>{x.overall.toFixed(1)}</b>
      </div>
      <div className="px-tile-body" style={{ "--s": x.color }}>
        <span className="px-tile-slot">{x.slot}</span>
        <span className="px-tile-badges">
          <span className="px-school-chip small" style={{ "--s": x.color }} title={x.school}>{x.school.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase()}</span>
          <span className="px-pos-chip" style={{ color: `var(--${x.pos.toLowerCase()})` }}>{x.pos}</span>
        </span>
        {x.img && !broken ? (
          <img className={`px-tile-photo${x.photo ? " full" : ""}`} src={x.img} alt="" title={x.imgCredit || undefined} loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <span className="px-tile-mono">{initials(x.name)}</span>
        )}
        {isPast(x) && <span className="px-tile-outcome"><OutcomeBadge x={x} /></span>}
      </div>
      <div className="px-tile-tier" style={{ background: x.tier.color }}>{x.tier.label || x.tier.key}</div>
    </button>
  );
}

// Class headline, KPIs and the top of the rookie draft: the 1.01 featured, then the next six.
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
          <div><small>{PROSPECT_TIERS[0].key}s</small><b>{topTier}</b></div>
        </div>
      </div>
      <div className="px-board">
        <BoardTile x={first} featured onOpen={onOpen} />
        {rest.slice(0, 6).map((x) => <BoardTile key={x.id} x={x} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rankings: a class sheet (under the board) or every class at one position
// ---------------------------------------------------------------------------

const sumKey = (x, k) => x.seasons.reduce((s, r) => s + (r[k] || 0), 0);
const peakDom = (x) => {
  const v = x.seasons.map((s) => dominatorOf(x.pos, s)).filter((d) => d != null);
  return v.length ? Math.max(...v) : null;
};

const COL = {
  pos: { key: "posRank", label: "Pos", get: (x) => x.posRank, show: (x) => <b style={{ color: `var(--${x.pos.toLowerCase()})` }}>{x.pos}{x.posRank}</b>, asc: true },
  classRk: { key: "posRank", label: "Class Rk", get: (x) => x.posRank, show: (x) => x.posRank, asc: true },
  tier: { key: "tier", label: "Tier", get: (x) => x.grade, show: (x) => <TierBadge tier={x.tier} small /> },
  classTier: { key: "classTier", label: "Class Tier", get: (x) => x.classTier, show: (x) => x.classTier, asc: true },
  z: { key: "z", label: "Z-Score", get: (x) => x.z, show: (x) => <b className="px-num px-green">{x.z.toFixed(2)}</b> },
  overall: { key: "overall", label: "Overall", get: (x) => x.overall, show: (x) => <b className="px-num px-green">{x.overall.toFixed(1)}</b> },
  grade: { key: "grade", label: "Grade", get: (x) => x.grade, show: (x) => <span className="px-green" style={{ fontWeight: 600 }}>{x.grade.toFixed(2)}</span> },
  type: { key: "build", label: "Type", get: (x) => x.build, show: (x) => x.build },
  archetype: { key: "archetype", label: "Archetype", get: (x) => x.archetype, show: (x) => x.archetype },
  height: { key: "height", label: "Ht", get: (x) => x.height, show: (x) => heightLabel(x.height) },
  weight: { key: "weight", label: "Wt", get: (x) => x.weight, show: (x) => x.weight ?? "—" },
  forty: { key: "forty", label: "40", get: (x) => x.forty, show: (x) => (x.forty ? x.forty.toFixed(2) : "—"), asc: true },
  draftAge: { key: "draftAge", label: "Draft Age", get: (x) => x.draftAge, show: (x) => ageLabel(x, x.draftAge), asc: true },
  predraft: { key: "predraft", label: "Pre-Draft", get: (x) => (isPast(x) ? x.pick : x.boardRank || UNRANKED_RANK), show: predraftLabel, asc: true },
  hype: { key: "hype", label: "Model vs Hype", get: (x) => x.hype.gap, show: (x) => <HypeBadge x={x} /> },
  pick: { key: "pick", label: "NFL Pick", get: (x) => x.pick, show: pickLabel, asc: true },
  outcome: { key: "outcome", label: "NFL Outcome", get: (x) => (isPast(x) ? -(x.outcome.best4 ?? 999) : null), show: (x) => (isPast(x) ? <OutcomeBadge x={x} /> : <span className="muted small">Not drafted yet</span>) },
};
// Class sheet: rookie-draft order for one class.
// Compact columns so the class sheet's overview fits a laptop screen without sideways scrolling.
const HYPE_SHORT = { model: "▲ Model", hype: "▲ Hype", aligned: "=" };
const COMPACT = {
  size: { key: "weight", label: "Size", get: (x) => x.weight, show: (x) => <span className="px-nowrap">{heightLabel(x.height)} · {x.weight ?? "—"}</span> },
  hype: {
    key: "hype", label: "Model / Hype", get: (x) => x.hype.gap,
    show: (x) => <span className={`px-hype-mini ${x.hype.key}`} title={`${x.hype.label}: production ${x.profile.toFixed(2)} vs draft capital ${x.capital.toFixed(1)}`}>{HYPE_SHORT[x.hype.key]}</span>,
  },
  archetype: { key: "archetype", label: "Archetype", get: (x) => x.archetype, show: (x) => <span className="px-profile">{x.archetype}</span> },
  type: { key: "build", label: "Type", get: (x) => x.build, show: (x) => <span className="px-profile">{x.build}</span> },
};
const SHEET_COLS = [COL.pos, COL.tier, COL.classTier, COL.z, COL.overall, COL.grade, COMPACT.size, COL.forty, COL.draftAge, COL.predraft, COMPACT.hype, COMPACT.archetype, COMPACT.type];
// Position rankings: every class at one position, by grade.
const RANK_COLS = [COL.classRk, COL.tier, COL.overall, COL.grade, COL.type, COL.archetype, COL.height, COL.weight, COL.forty, COL.draftAge, COL.predraft, COL.pick, COL.outcome];

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
// The 0-10 input grades for one position (or breakout/draft age when positions are mixed).
function metricCols(pos) {
  if (pos === "ALL") {
    return [
      { key: "breakoutAge", label: "Breakout Age", get: (x) => x.breakoutAge, show: (x) => (x.breakoutAge ? ageLabel(x, x.breakoutAge) : "—"), asc: true },
      COL.draftAge,
    ];
  }
  return METRICS[pos].map((m) => ({
    key: m.key, label: m.label,
    get: (x) => x.grades[m.key],
    show: (x) => {
      const mm = x.metrics.find((y) => y.key === m.key);
      return mm.grade == null ? "—" : (
        <span title={mm.fmt(mm.value)} style={{ color: gradeTone(mm.grade), fontWeight: 600 }}>{Math.round(mm.grade)} <small>{letter(mm.grade)}</small></span>
      );
    },
  }));
}
const INPUT_COLS = [
  COL.grade,
  { key: "predraftScore", label: "Pre-Draft Score", get: (x) => x.predraft, show: (x) => x.predraft.toFixed(2) },
  { key: "capitalBoost", label: "DC Boost", get: (x) => x.capitalBoost, show: (x) => `+${x.capitalBoost.toFixed(2)}` },
  { key: "profile", label: "Production", get: (x) => x.profile, show: (x) => x.profile.toFixed(2) },
  { key: "capital", label: "Draft Capital", get: (x) => x.capital, show: (x) => x.capital.toFixed(1) },
  COL.predraft,
];

function Select({ value, onChange, all, options }) {
  return (
    <select className={`select${value ? " px-on" : ""}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// `single`: one class's sheet in rookie-draft order (Pick column, no class controls).
// Otherwise: every class at one position, ranked by grade, with a fixed RK that survives filters.
export function RankingsView({ list, pos, onOpen, single }) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [tier, setTier] = useState("");
  const [arch, setArch] = useState("");
  const [build, setBuild] = useState("");
  const [round, setRound] = useState("");
  const [cols, setCols] = useState("overview");
  const [sort, setSort] = useState({ key: single || pos === "ALL" ? "z" : "grade", asc: false });

  const columns = useMemo(() => {
    if (cols === "production") return PRODUCTION_COLS;
    if (cols === "metrics") return metricCols(pos);
    if (cols === "inputs") return INPUT_COLS;
    return single ? SHEET_COLS : RANK_COLS;
  }, [cols, pos, single]);
  const fixedRank = useMemo(() => {
    const m = {};
    [...list].sort((a, b) => (pos === "ALL" ? b.z - a.z : b.grade - a.grade)).forEach((x, i) => (m[x.id] = i + 1));
    return m;
  }, [list, pos]);
  const options = (f) => [...new Set(list.map(f))].sort();
  const classes = [...new Set(list.map((x) => x.draftYear))].sort((a, b) => b - a);
  const roundOptions = [...[1, 2, 3, 4, 5, 6, 7].map((r) => `Round ${r}`), ...ROUND_BUCKETS.map((r) => ROUND_LABELS[r]), "Unranked"];
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = list.filter((x) =>
      (!term || `${x.name} ${x.school}`.toLowerCase().includes(term)) &&
      (!cls || x.draftYear === Number(cls)) &&
      (!tier || x.tier.key === tier) && (!arch || x.archetype === arch) && (!build || x.build === build) &&
      (!round || roundLabel(x) === round));
    const col = [...columns, COL.z, COL.grade].find((c) => c.key === sort.key);
    if (!col) return out;
    const dir = sort.asc ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir || b.z - a.z;
    });
  }, [list, q, cls, tier, arch, build, round, sort, columns]);

  const clickSort = (c) => setSort((s) => (s.key === c.key ? { key: c.key, asc: !s.asc } : { key: c.key, asc: !!c.asc }));
  const compact = single && cols === "overview";
  const filtered = q || cls || tier || arch || build || round;
  const clear = () => [setQ, setCls, setTier, setArch, setBuild, setRound].forEach((f) => f(""));

  return (
    <div className="px-rankings">
      <div className="px-filters">
        <input className="input" placeholder="Filter by name or school" value={q} onChange={(e) => setQ(e.target.value)} />
        {!single && <Select value={cls} onChange={setCls} all="All classes" options={classes.map(String)} />}
        <Select value={tier} onChange={setTier} all="All tiers" options={PROSPECT_TIERS.map((t) => t.key).filter((t) => list.some((x) => x.tier.key === t))} />
        <Select value={build} onChange={setBuild} all="All types" options={options((x) => x.build)} />
        <Select value={arch} onChange={setArch} all="All archetypes" options={options((x) => x.archetype)} />
        <Select value={round} onChange={setRound} all="All rounds" options={roundOptions.filter((r) => list.some((x) => roundLabel(x) === r))} />
        {filtered && <button className="px-pill" onClick={clear}>Clear</button>}
      </div>
      <div className="px-filters" style={{ justifyContent: "space-between" }}>
        <div className="px-viewtabs">
          {[["overview", "Overview"], ["production", "Production"], ["metrics", "Metrics"], ["inputs", "Model inputs"]].map(([k, l]) => (
            <button key={k} className={cols === k ? "on" : ""} onClick={() => setCols(k)}>{l}</button>
          ))}
        </div>
        <span className="muted small">{rows.length} players{cols === "production" ? " · college career totals" : ""}{single ? " · class sheet order (Z-score)" : ""}</span>
      </div>
      <div className={`table-wrap px-table${compact ? " compact" : ""}`}>
        <table className="t">
          <thead>
            <tr>
              <th className="rnk">{single ? "Pick" : "Rk"}</th>
              <th>Player</th>
              {!compact && <th>School</th>}
              {!single && <th className="c">Class</th>}
              {columns.map((c) => (
                <th key={c.key} className={`c sortable${sort.key === c.key ? " sorted" : ""}`} onClick={() => clickSort(c)}>
                  {c.label} {sort.key === c.key ? (sort.asc ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className="px-row" style={{ "--t": x.tier.color }} onClick={() => onOpen(x.id)}>
                <td className="rnk"><b className="px-rk">{single ? x.slot : fixedRank[x.id]}</b></td>
                <td>
                  <button className="plink pcell" onClick={() => onOpen(x.id)} title={`Open ${x.name}`}>
                    <span className="px-rk-photo" style={{ "--t": x.tier.color }}><Monogram x={x} size={compact ? 44 : 56} /></span>
                    {compact ? (
                      <span className="px-rk-namebox">
                        <span className="pname px-rk-name">{x.name}</span>
                        <span className="px-school small"><i style={{ background: x.color }} />{x.school}</span>
                      </span>
                    ) : (
                      <span className="pname px-rk-name">{x.name}</span>
                    )}
                  </button>
                </td>
                {!compact && <td><span className="px-school"><i style={{ background: x.color }} />{x.school}</span></td>}
                {!single && <td className="c">{x.draftYear}</td>}
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

const schoolAbbr = (school) => (school || "").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();

function SchoolChip({ x, size = 44 }) {
  return (
    <span className="px-school-chip" style={{ "--s": x.color, width: size, height: size, fontSize: size * 0.32 }} title={x.school}>
      {schoolAbbr(x.school)}
    </span>
  );
}

// Left-hand player card: tier, position rank, photo (or initials) and name.
function IdCard({ x }) {
  const [broken, setBroken] = useState(false);
  const [first, ...rest] = x.name.split(" ");
  return (
    <div className="px-idcard" style={{ "--s": x.color }}>
      <div className="px-idcard-top">
        <TierBadge tier={x.tier} />
        <span className="px-posbadge">{x.pos}{x.posRank}</span>
      </div>
      <div className="px-idcard-photo">
        <span className="px-idcard-school">{schoolAbbr(x.school)}</span>
        {x.img && !broken ? <img className={x.photo ? "full" : ""} src={x.img} alt={x.name} onError={() => setBroken(true)} /> : <span className="px-idcard-mono">{initials(x.name)}</span>}
        {x.img && !broken && x.imgCredit && <span className="px-credit">{x.imgCredit}</span>}
      </div>
      <div className="px-idcard-name">
        <span>{first}</span>
        <b>{rest.join(" ")}</b>
      </div>
    </div>
  );
}

function bigRate(p) {
  return (
    <span className="px-bigrate">
      <b style={{ color: rateColor(p) }}>{p}%</b>
      <span className="px-bar"><i style={{ width: `${p}%`, background: rateColor(p) }} /></span>
    </span>
  );
}

// How past prospects like this one turned out: by our tier (default) or by draft round.
function TierHitPanel({ x, hitRates, tierHits }) {
  const bucket = x.round || "R6-7";
  const [mode, setMode] = useState("tier");
  const h = mode === "tier" ? tierHits[x.pos]?.[x.tier.key] : hitRates[x.pos]?.[bucket];
  return (
    <div className="card px-panel">
      <div className="px-panel-head">
        <h3>{mode === "tier" ? `${x.tier.key} hit rate` : `${ROUND_LABELS[bucket]} hit rate`}</h3>
        <span>{h ? `${h.n} players` : ""}</span>
      </div>
      <div className="px-hitwrap">
        <div>
          {h ? (
            <div className="px-bigrates">
              {[["top12", 1], ["top24", 2], ["top36", 3]].map(([k, n]) => (
                <div key={k}><small>{x.pos}{n}</small>{bigRate(h[k])}</div>
              ))}
            </div>
          ) : (
            <div className="empty">No past {x.pos}s in this {mode === "tier" ? "tier" : "round"} yet.</div>
          )}
          <p className="muted small" style={{ margin: "0.6rem 0 0" }}>
            {mode === "tier" ? `${x.pos}s drafted 2018–2022 that our model put in the ${x.tier.key} tier` : `${x.pos}s drafted in ${ROUND_LABELS[bucket]}, 2012–2021`}: share with a top-12 / 24 / 36 PPR season in their first four years.
            {h && h.n < 5 ? " Fewer than 5 players, so treat it as an anecdote." : ""}
          </p>
          <div className="seg" style={{ marginTop: "0.6rem" }}>
            <button className={mode === "tier" ? "on" : ""} onClick={() => setMode("tier")}>By tier</button>
            <button className={mode === "round" ? "on" : ""} onClick={() => setMode("round")}>By {isPast(x) ? "draft" : "projected"} round</button>
          </div>
        </div>
        <div className="px-predraft">
          <div><small>Pre-draft score</small><b>{x.predraft.toFixed(2)}</b></div>
          <div><small>Pre-draft grade</small><b>{predraftLabel(x).toUpperCase()}</b></div>
          {isPast(x) && <div><small>NFL outcome</small><b><OutcomeBadge x={x} /></b></div>}
        </div>
      </div>
    </div>
  );
}

// Tier × draft round grid for the player's position, with his own cell highlighted.
function TierRoundPanel({ x, history }) {
  const [finish, setFinish] = useState(24);
  const grid = useMemo(() => tierRoundGrid(history, x.pos, finish), [history, x.pos, finish]);
  const mix = useMemo(() => outcomeMix(history, x.pos), [history, x.pos]);
  const myRound = isPast(x) ? x.draftRound : null;
  return (
    <div className="card px-panel">
      <div className="px-panel-head">
        <h3>{x.pos} hit rates by tier and draft round</h3>
        <div className="seg">
          {[12, 24, 36].map((n) => (
            <button key={n} className={finish === n ? "on" : ""} onClick={() => setFinish(n)}>Top {n}</button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="t px-grid">
          <thead>
            <tr><th>Tier</th>{[1, 2, 3, 4, 5, 6, 7].map((r) => <th key={r} className={`c${r === myRound ? " px-mine" : ""}`}>Rd {r}</th>)}<th>Outcome mix</th></tr>
          </thead>
          <tbody>
            {PROSPECT_TIERS.map((t) => {
              const m = mix[t.key];
              return (
                <tr key={t.key} className={t.key === x.tier.key ? "px-mine-row" : ""}>
                  <td><TierBadge tier={t} small /></td>
                  {[1, 2, 3, 4, 5, 6, 7].map((r) => {
                    const c = grid[`${t.key}|${r}`];
                    if (!c) return <td key={r} className="c muted">—</td>;
                    const p = Math.round((c.hits / c.n) * 100);
                    return (
                      <td key={r} className="c">
                        <span className={`px-cell${c.n < 3 ? " faded" : ""}${t.key === x.tier.key && r === myRound ? " mine" : ""}`} style={{ "--o": rateColor(p) }}>
                          <b>{p}%</b><small>{c.hits} of {c.n}</small>
                        </span>
                      </td>
                    );
                  })}
                  <td style={{ minWidth: 140 }}>
                    {m ? (
                      <span className="px-stack" title={OUTCOMES.map((o) => `${o.label}: ${m[o.key]}`).join(" · ")}>
                        {OUTCOMES.map((o) => (m[o.key] ? <i key={o.key} style={{ width: `${(m[o.key] / m.n) * 100}%`, background: o.color }} /> : null))}
                      </span>
                    ) : <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-legend" style={{ marginTop: "0.6rem" }}>{OUTCOMES.map((o) => <span key={o.key}><i style={{ background: o.color }} />{o.label}</span>)}</div>
      <p className="muted small">
        {x.pos}s drafted 2018–2022 with a top-{finish} season in their first four years, by our tier and the round they were drafted in. His tier is highlighted{myRound ? ", and his round" : ""}. Faded cells have fewer than 3 players: anecdotes, not rates.
      </p>
    </div>
  );
}

function HypePanel({ x, hypeCard }) {
  const a = hypeCard[x.pos]?.[x.hype.key];
  const msg = {
    model: `His production profile (${x.profile.toFixed(2)}) grades well above his ${isPast(x) ? "draft slot" : "big-board"} capital (${x.capital.toFixed(1)}). The model likes him more than the market does.`,
    hype: `His ${isPast(x) ? "draft slot" : "big-board"} capital (${x.capital.toFixed(1)}) is well ahead of his production profile (${x.profile.toFixed(2)}). The market likes him more than the numbers do.`,
    aligned: `Profile (${x.profile.toFixed(2)}) and ${isPast(x) ? "draft" : "board"} capital (${x.capital.toFixed(1)}) are within ${HYPE_GAP} points of each other.`,
  }[x.hype.key];
  return (
    <div className="px-hype">
      <HypeBadge x={x} />
      <span className="small">
        {msg}
        {a ? ` Past ${x.pos}s with the same call had a top-24 season ${Math.round((a.hits / a.n) * 100)}% of the time (${a.hits} of ${a.n}).` : ""}
      </span>
    </div>
  );
}

// Side-by-side comparison, opened from a VS button.
export function HeadToHead({ x, y, tierHits, onClose }) {
  const ty = (p) => tierHits[p.pos]?.[p.tier.key];
  const row = (label, a, b, better) => ({ label, a, b, better });
  const num = (p, k) => p[k];
  const rows = [
    row("Overall", x.overall.toFixed(1), y.overall.toFixed(1), Math.sign(x.overall - y.overall)),
    row(`${x.pos} Grade`, x.grade.toFixed(2), y.grade.toFixed(2), Math.sign(x.grade - y.grade)),
    row("Class", x.draftYear, y.draftYear, 0),
    row("Build", x.build, y.build, 0),
    row("Archetype", x.archetype, y.archetype, 0),
    row("Height", heightLabel(x.height), heightLabel(y.height), 0),
    row("Weight", x.weight ? `${x.weight} lb` : "—", y.weight ? `${y.weight} lb` : "—", 0),
    row("40 Time", x.forty ? x.forty.toFixed(2) : "—", y.forty ? y.forty.toFixed(2) : "—", x.forty && y.forty ? Math.sign(y.forty - x.forty) : 0),
    row("Draft Age", ageLabel(x, x.draftAge), ageLabel(y, y.draftAge), Math.sign(num(y, "draftAge") - num(x, "draftAge"))),
    row("Draft Round", roundLabel(x), roundLabel(y), 0),
    row("Pre-Draft Score", x.predraft.toFixed(2), y.predraft.toFixed(2), Math.sign(x.predraft - y.predraft)),
    ...x.metrics.map((m) => {
      const gb = y.grades[m.key];
      const ga = m.grade;
      const show = (g) => (g == null ? "—" : `${Math.round(g)} · ${letter(g)}`);
      return row(m.label, show(ga), show(gb), ga != null && gb != null ? Math.sign(Math.round(ga) - Math.round(gb)) : 0);
    }),
    ...[["top12", 1], ["top24", 2], ["top36", 3]].map(([k, n]) => {
      const a = ty(x)?.[k];
      const b = ty(y)?.[k];
      return row(`Tier ${x.pos}${n} rate`, a != null ? `${a}%` : "—", b != null ? `${b}%` : "—", a != null && b != null ? Math.sign(a - b) : 0);
    }),
  ];
  const cls = (s, side) => (s === 0 ? "" : (side === "a" ? s > 0 : s < 0) ? " better" : " worse");
  return (
    <div className="card px-panel px-h2h">
      <div className="px-panel-head">
        <h3>Head to head</h3>
        {onClose && <button className="link" onClick={onClose}>Close ✕</button>}
      </div>
      <div className="px-h2h-cards">
        {[x, y].map((p, i) => (
          <div key={p.id} className={`px-h2h-card${i ? " right" : ""}`} style={{ "--s": p.color }}>
            <Monogram x={p} size={72} />
            <div>
              <small>{p.name.split(" ")[0]}</small>
              <b>{p.name.split(" ").slice(1).join(" ")}</b>
              <span>Overall {p.overall.toFixed(1)} · {p.pos} Grade {p.grade.toFixed(2)} · {p.draftYear} class</span>
            </div>
            <span className="px-h2h-tier" style={{ background: p.tier.color }}>{p.tier.label || p.tier.key}</span>
          </div>
        ))}
        <span className="px-h2h-vs">VS</span>
      </div>
      <div className="px-h2h-body">
        <div>
          <div className="px-legend" style={{ justifyContent: "center" }}>
            <span><i style={{ background: "var(--good)" }} />{x.name}</span>
            <span><i style={{ background: "var(--text)" }} />{y.name}</span>
          </div>
          <Radar metrics={x.metrics} other={y} />
        </div>
        <table className="t px-h2h-table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className={`c${cls(r.better, "a")}`}>{r.a}</td>
                <th className="c">{r.label}</th>
                <td className={`c${cls(r.better, "b")}`}>{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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


export function ReportCard({ x, classList, history, hitRates, tierHits, hypeCard, onOpen, onBack, backLabel }) {
  const [vs, setVs] = useState(null);
  const everyone = useMemo(() => [...classList, ...history], [classList, history]);
  const other = vs ? everyone.find((y) => y.id === vs) : null;
  const classComps = closestProfiles(x, classList);
  const pastComps = closestProfiles(x, history.filter((y) => y.draftYear !== x.draftYear), 6);
  const bio = [
    ["Class", x.classYear],
    ["Draft Age", ageLabel(x, x.draftAge)],
    ["Age Today", ageLabel(x, x.ageToday)],
    ["Height", heightLabel(x.height)],
    ["Weight", x.weight ? `${x.weight} lb` : "—"],
    ["Build", x.build],
    ["Archetype", x.archetype],
    ["Breakout", x.breakoutSeason ? `${x.breakoutSeason} (age ${ageLabel(x, x.breakoutAge)})` : "None"],
    ["Rookie Slot", `${x.slot} · tier ${x.classTier}`],
    ["40 Time", x.forty ? x.forty.toFixed(2) : "—"],
    ["Draft Round", roundLabel(x)],
    ["Draft Pick", pickLabel(x)],
  ];
  // CompRow passes the next value (an id, or null to close).
  const compare = (id) => {
    setVs(id);
    if (id) setTimeout(() => document.getElementById("px-h2h")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="grid px-report">
      <button className="link px-back" onClick={onBack}>← {backLabel || `${x.draftYear} board`}</button>

      <div className="px-top">
        <IdCard x={x} />
        <div className="px-top-right">
          <div className="px-strip" style={{ "--s": x.color }}>
            <div className="px-strip-school">
              <SchoolChip x={x} />
              <span>
                <b>{x.school}</b>
                <small>{x.draftYear} · {x.classShort}</small>
              </span>
            </div>
            <div className="hl"><small>Overall</small><b>{x.overall.toFixed(1)}</b></div>
            <div><small>{x.pos} Grade</small><b>{x.grade.toFixed(2)}</b></div>
            <div><small>Z-Score</small><b>{x.z.toFixed(2)}</b></div>
            <div><small>Class Rank</small><b>{x.pos}{x.posRank}</b></div>
          </div>
          <div className="px-bio" style={{ "--s": x.color }}>
            {bio.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
          </div>
          <HypePanel x={x} hypeCard={hypeCard} />
        </div>
      </div>

      <div className="px-two">
        <div className="card px-panel">
          <div className="px-panel-head">
            <h3>Grades</h3>
            <span>Stat · grade · letter</span>
          </div>
          <div className="px-grades-wrap">
            <div className="px-grades">
              {x.metrics.map((m) => (
                <div key={m.key} className="px-grade" title={m.note}>
                  <span>{m.label}</span>
                  <GradeBar grade={m.grade} />
                  <span className="muted small">{m.fmt(m.value)}</span>
                  <b>{m.grade == null ? "—" : Math.round(m.grade)}</b>
                  <em style={{ color: gradeTone(m.grade) }}>{m.grade == null ? "" : letter(m.grade)}</em>
                </div>
              ))}
            </div>
            <Radar metrics={x.metrics} />
          </div>
        </div>
        <TierHitPanel x={x} hitRates={hitRates} tierHits={tierHits} />
      </div>

      <div className="px-two">
        <div className="card px-panel">
          <div className="px-panel-head"><h3>Historical Comps</h3><span>Closest past {x.pos} grade profiles · select VS to compare</span></div>
          {pastComps.length === 0 && <div className="empty">No past {x.pos}s with enough data to compare.</div>}
          {pastComps.map(({ y, d }) => (
            <CompRow key={y.id} y={y} d={d} vs={vs} setVs={compare} onOpen={onOpen} sub={`${y.school} · pick ${y.pick}`} />
          ))}
        </div>
        <div className="card px-panel">
          <div className="px-panel-head"><h3>Closest in Class</h3><span>{x.draftYear} {x.pos}s · select VS to compare</span></div>
          {classComps.length === 0 && <div className="empty">No other {x.pos}s in this class.</div>}
          {classComps.map(({ y, d }) => (
            <CompRow key={y.id} y={y} d={d} vs={vs} setVs={compare} onOpen={onOpen} sub={`${y.school} · ${y.archetype}`} />
          ))}
        </div>
      </div>

      {other && (
        <div id="px-h2h">
          <HeadToHead x={x} y={other} tierHits={tierHits} onClose={() => setVs(null)} />
        </div>
      )}

      <TierRoundPanel x={x} history={history} />

      <SeasonTable x={x} />

      <div className="card px-panel">
        <div className="px-panel-head"><h3>Notes</h3><span>Data caveats</span></div>
        <ul className="px-notes">
          {x.notes && <li>{x.notes}</li>}
          {!x.dobKnown && <li>No published birthdate found, so ages assume 18.6 at the start of his first college season ({x.firstSeason}).</li>}
          {!x.forty && <li>No verified 40 time{isPast(x) ? " (didn't run at the combine)" : " yet"}. Speed Score is left out of his grade.</li>}
          {!isPast(x) && !x.boardRank && <li>Not on the Tankathon big board, so draft capital is priced like pick {UNRANKED_RANK}.</li>}
          <li>{x.pos} grade = {gradeFormula(x.pos)}. Production is the weighted average of the 0–10 input grades; draft capital is 0–10 from {isPast(x) ? "the actual pick" : "the big-board rank"}.</li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glossary: searchable cards per position
// ---------------------------------------------------------------------------

const GENERAL_TERMS = [
  ["Position grade", `Production plus draft capital, usually 8–15 for real prospects: ${["QB", "RB", "WR", "TE"].map((p) => `${p} = ${gradeFormula(p)}`).join(" · ")}. Fitted so our grades line up with established prospect-model scores.`],
  ["Pre-draft score", "The production part of the grade on its own: the position grade before any draft-capital boost."],
  ["Pre-draft grade", "Where the prospect is projected to go (or went): Top 10, 1st Round, 2nd Round, 3rd Round or Day 3."],
  ["Draft capital", `A 0–10 grade from draft position on a log scale: #1 = 10, #32 = 8, #64 = 6.5, #100 = 5, #150 = 3.5. The coming class uses its Tankathon big-board rank; past classes use the actual pick. Unranked prospects are priced like #${UNRANKED_RANK}. The DC boost is the grade points it adds.`],
  ["Overall", "The grade's percentile among every prospect at the position (0–100), so a 98.5 grades better than 98.5% of them."],
  ["Z-score", "(Overall − 50) ÷ 28.8, which puts every position on one scale; TEs are discounted slightly. Class order and rookie slots run on it."],
  ["Class tier", "Rookie-draft tiers within a class: a new tier every 0.05 of z-score down from the top."],
  ["Tier", `Cut on the position grade, best to worst: ${PROSPECT_TIERS.map((t) => t.key).join(", ")}. ${["QB", "RB", "WR", "TE"].map((p) => `${p} cuts: ${TIER_CUTS[p].join(" / ")}`).join(" · ")}.`],
  ["Crowded room", `When other future draft picks at the same position shared a player's college offense, his dominator is scaled up as if ${Math.round(ROOM_WEIGHT * 100)}% of their share had been his to win. This lifts receivers from loaded rooms (Alabama, Ohio State) and is measured, not hand-picked.`],
  ["Model vs hype", `Compares the production grade with the draft-capital grade. A gap of ${HYPE_GAP}+ either way flags where the model and the market disagree.`],
  ["Class rank", "Position rank within the draft class by grade."],
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
