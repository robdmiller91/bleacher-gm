"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHead } from "@/components/ui";
import { BoardView, GlossaryView, HitRatesView, RankingsView, ReportCard } from "@/components/prospects";
import { PROSPECT_CLASS, loadProspectData } from "@/lib/prospects";

const TABS = [["board", "Board"], ["rankings", "Rankings"], ["hits", "Hit Rates"], ["glossary", "Glossary"]];

// The open report card lives in ?p=<id> so it can be linked and survives a refresh.
const readParam = () => new URLSearchParams(window.location.search).get("p");
function writeParam(id) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("p", id);
  else url.searchParams.delete("p");
  window.history.replaceState(null, "", url);
}

export default function Prospects() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState("board");
  const [pos, setPos] = useState("ALL");
  const [year, setYear] = useState(PROSPECT_CLASS);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    loadProspectData().then(setData).catch(() => setError(true));
    setOpen(readParam());
  }, []);

  const years = useMemo(
    () => (data ? [PROSPECT_CLASS, ...[...new Set(data.history.map((x) => x.draftYear))].sort((a, b) => b - a)] : [PROSPECT_CLASS]),
    [data],
  );
  const classList = useMemo(() => {
    if (!data) return [];
    const all = year === PROSPECT_CLASS ? data.prospects : data.history.filter((x) => x.draftYear === year);
    return [...all].sort((a, b) => a.rank - b.rank);
  }, [data, year]);
  const shown = useMemo(() => (pos === "ALL" ? classList : classList.filter((x) => x.pos === pos)), [classList, pos]);
  // Rankings span every class: the coming one plus every past draft we've graded.
  const everyone = useMemo(() => {
    if (!data) return [];
    const all = [...data.prospects, ...data.history];
    return pos === "ALL" ? all : all.filter((x) => x.pos === pos);
  }, [data, pos]);

  const openProspect = (id) => {
    setOpen(id);
    writeParam(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const close = () => {
    setOpen(null);
    writeParam(null);
  };

  if (error) return <div className="card empty">Couldn't load the prospect data files.</div>;
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;

  const current = open ? [...data.prospects, ...data.history].find((x) => x.id === open) : null;
  if (current) {
    const mates = current.draftYear === PROSPECT_CLASS ? data.prospects : data.history.filter((x) => x.draftYear === current.draftYear);
    return (
      <ReportCard
        key={current.id}
        x={current}
        classList={mates}
        history={data.history}
        hitRates={data.hitRates}
        tierHits={data.tierHits}
        onOpen={openProspect}
        onBack={() => {
          setYear(current.draftYear);
          close();
        }}
      />
    );
  }

  return (
    <>
      <PageHead
        title="BGM"
        accent="Prospect Score"
        sub="Our own rookie model: college production, age and size, blended with draft capital, and checked against how drafted QBs, RBs, WRs and TEs since 2018 actually turned out."
      >
        {tab === "board" && (
          <select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Draft class">
            {years.map((y) => <option key={y} value={y}>{y === PROSPECT_CLASS ? `${y} class` : `${y} (past)`}</option>)}
          </select>
        )}
        <div className="seg">
          {["ALL", "QB", "RB", "WR", "TE"].map((p) => (
            <button key={p} className={pos === p ? "on" : ""} onClick={() => setPos(p)}>{p === "ALL" ? "All" : p}</button>
          ))}
        </div>
      </PageHead>

      <div className="px-tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "board" && <BoardView list={shown} year={year} onOpen={openProspect} />}
      {tab === "rankings" && <RankingsView key={pos} list={everyone} pos={pos} onOpen={openProspect} />}
      {tab === "hits" && <HitRatesView history={data.history} hitRates={data.hitRates} hypeCard={data.hypeCard} pos={pos} />}
      {tab === "glossary" && <GlossaryView pos={pos} />}
      <p className="muted small" style={{ marginTop: "1.2rem" }}>
        College stats from ESPN. Past drafts, combine results and NFL fantasy finishes from nflverse (CC BY 4.0). {PROSPECT_CLASS} big-board ranks from Tankathon.
        The BGM Prospect Score is our own model.
      </p>
    </>
  );
}
