"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BoardView, GlossaryView, RankingsView, ReportCard } from "@/components/prospects";
import { PROSPECT_CLASS, loadProspectData } from "@/lib/prospects";

const POSITIONS = ["QB", "RB", "WR", "TE"];
const VIEWS = ["board", "rankings", "glossary"];

// What's on screen lives in the URL (?view=, ?pos=, ?class=, ?p=) so any page can be linked or refreshed.
function readUrl() {
  const p = new URLSearchParams(window.location.search);
  return {
    view: VIEWS.includes(p.get("view")) ? p.get("view") : "board",
    pos: POSITIONS.includes(p.get("pos")) ? p.get("pos") : "WR",
    year: Number(p.get("class")) || PROSPECT_CLASS,
    open: p.get("p"),
  };
}
function writeUrl({ view, pos, year, open }) {
  const url = new URL(window.location.href);
  const set = (k, v, dflt) => (v && v !== dflt ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  set("view", view, "board");
  set("pos", view === "rankings" || view === "glossary" ? pos : null);
  set("class", view === "board" ? year : null, PROSPECT_CLASS);
  set("p", open);
  window.history.replaceState(null, "", url);
}

function ProspectSearch({ everyone, onOpen }) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const ref = useRef(null);
  const term = q.trim().toLowerCase();
  const hits = term.length < 2 ? [] : everyone.filter((x) => x.name.toLowerCase().includes(term)).sort((a, b) => b.z - a.z).slice(0, 8);
  return (
    <div className="px-search">
      <input
        ref={ref}
        className="input"
        placeholder="Search any prospect"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) {
            onOpen(hits[0].id);
            setQ("");
            ref.current?.blur();
          }
        }}
      />
      {focus && hits.length > 0 && (
        <div className="px-search-results">
          {hits.map((x) => (
            <button
              key={x.id}
              onMouseDown={() => {
                onOpen(x.id);
                setQ("");
              }}
            >
              <b>{x.name}</b>
              <span className="muted small">{x.pos}{x.posRank} · {x.school} · {x.draftYear}</span>
              <span className="px-search-tier" style={{ background: x.tier.color }}>{x.tier.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Prospects() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState("board");
  const [pos, setPos] = useState("WR");
  const [year, setYear] = useState(PROSPECT_CLASS);
  const [boardPos, setBoardPos] = useState("ALL");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    loadProspectData().then(setData).catch(() => setError(true));
    const s = readUrl();
    setView(s.view);
    setPos(s.pos);
    setYear(s.year);
    setOpen(s.open);
  }, []);
  // Player links in the site-wide chat open report cards here.
  useEffect(() => {
    const onOpenEvent = (e) => {
      setOpen(String(e.detail));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("bgm:open-prospect", onOpenEvent);
    return () => window.removeEventListener("bgm:open-prospect", onOpenEvent);
  }, []);
  useEffect(() => {
    if (data) writeUrl({ view, pos, year, open });
  }, [data, view, pos, year, open]);

  const everyone = useMemo(() => (data ? [...data.prospects, ...data.history] : []), [data]);
  const years = useMemo(
    () => (data ? [...new Set(data.history.map((x) => x.draftYear))].sort((a, b) => b - a) : []),
    [data],
  );
  const classList = useMemo(() => {
    if (!data) return [];
    const all = year === PROSPECT_CLASS ? data.prospects : data.history.filter((x) => x.draftYear === year);
    return [...all].sort((a, b) => a.rank - b.rank);
  }, [data, year]);
  const sheet = useMemo(() => (boardPos === "ALL" ? classList : classList.filter((x) => x.pos === boardPos)), [classList, boardPos]);
  const posList = useMemo(() => everyone.filter((x) => x.pos === pos), [everyone, pos]);
  const counts = useMemo(() => {
    const c = { ALL: classList.length };
    for (const x of classList) c[x.pos] = (c[x.pos] || 0) + 1;
    return c;
  }, [classList]);

  const go = (next) => {
    if (next.view) setView(next.view);
    if (next.pos) setPos(next.pos);
    if (next.year) setYear(next.year);
    setOpen(next.open ?? null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openProspect = (id) => go({ open: id });

  if (error) return <div className="card empty">Couldn't load the prospect data files.</div>;
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;

  const current = open ? everyone.find((x) => x.id === open) : null;
  const tab = current ? "report" : view;

  return (
    <div className="px-app">
      <header className="px-nav">
        <button className="px-brand" onClick={() => go({ view: "board", year: PROSPECT_CLASS })}>
          <span className="px-brand-mark">BGM</span>
          <span>Prospect Score</span>
        </button>
        <button className={`px-pill${!current && view === "board" && year === PROSPECT_CLASS ? " hot" : ""}`} onClick={() => go({ view: "board", year: PROSPECT_CLASS })}>
          {PROSPECT_CLASS}
        </button>
        <select
          className={`px-pill${!current && view === "board" && year !== PROSPECT_CLASS ? " hot" : ""}`}
          value={view === "board" && year !== PROSPECT_CLASS ? year : ""}
          onChange={(e) => e.target.value && go({ view: "board", year: Number(e.target.value) })}
          aria-label="Past classes"
        >
          <option value="">Past classes</option>
          {years.map((y) => <option key={y} value={y}>{y} class</option>)}
        </select>
        <span className="px-nav-sep" />
        {POSITIONS.map((p) => (
          <button
            key={p}
            className={`px-pos-pill${!current && view !== "board" && pos === p ? " on" : ""}`}
            style={{ "--c": `var(--${p.toLowerCase()})` }}
            onClick={() => go({ view: view === "glossary" ? "glossary" : "rankings", pos: p })}
          >
            {p}
          </button>
        ))}
        <ProspectSearch everyone={everyone} onOpen={openProspect} />
      </header>
      <nav className="px-subnav">
        <button className={tab === "rankings" ? "on" : ""} onClick={() => go({ view: "rankings" })}>Rankings</button>
        {current && <button className="on">Report card</button>}
        <button className={tab === "glossary" ? "on" : ""} onClick={() => go({ view: "glossary" })}>Glossary</button>
      </nav>

      {current ? (
        <ReportCard
          key={current.id}
          x={current}
          classList={current.draftYear === PROSPECT_CLASS ? data.prospects : data.history.filter((x) => x.draftYear === current.draftYear)}
          history={data.history}
          hitRates={data.hitRates}
          tierHits={data.tierHits}
          hypeCard={data.hypeCard}
          onOpen={openProspect}
          backLabel={view === "board" ? `${current.draftYear} board` : "Back"}
          onBack={() => (view === "board" ? go({ view: "board", year: current.draftYear }) : go({}))}
        />
      ) : view === "board" ? (
        <>
          <BoardView list={classList} year={year} onOpen={openProspect} />
          <div className="px-sheet-bar">
            {["ALL", ...POSITIONS].map((p) => (
              <button key={p} className={`px-pill${boardPos === p ? " hot" : ""}`} onClick={() => setBoardPos(p)}>
                {p === "ALL" ? "Overall" : p} {p !== "ALL" && <span className="px-count" style={{ color: `var(--${p.toLowerCase()})` }}>{counts[p] ?? 0}</span>}
              </button>
            ))}
          </div>
          <RankingsView key={`${year}-${boardPos}`} list={sheet} pos={boardPos} single onOpen={openProspect} />
        </>
      ) : view === "rankings" ? (
        <>
          <div className="px-title">
            <h1><span>{pos}</span> Rankings</h1>
            <p>Every {pos} prospect graded since 2018 plus the {PROSPECT_CLASS} class, ranked by {pos} Grade. Select a player to open their report card.</p>
          </div>
          <RankingsView key={pos} list={posList} pos={pos} onOpen={openProspect} />
        </>
      ) : (
        <>
          <div className="px-title">
            <h1><span>{pos}</span> Glossary</h1>
            <p>What every grade, metric and label in the {pos} model means.</p>
          </div>
          <GlossaryView pos={pos} />
        </>
      )}

      <p className="muted small" style={{ marginTop: "1.6rem" }}>
        College stats from ESPN. Past drafts, combine results, NFL fantasy finishes and NFL headshots from nflverse (CC BY 4.0) and Sleeper. {PROSPECT_CLASS} big-board ranks from Tankathon.
        The BGM Prospect Score is our own model.
      </p>
    </div>
  );
}
