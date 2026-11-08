"use client";

import { PROSPECT_CLASS } from "@/lib/prospects";
import { dataIn, draftSlot, draftedChance, hitChance, scoreHistory, trendOf, weekLabel } from "@/lib/prospectTrend";

const slotText = (s) => (s ? `Rd ${s.round} · pick ${s.pick}` : "Undrafted");

// The coming class's draft projection: model score and its weekly movement, a one-line read,
// then hit chance, NFL draft slot, our position rank and how much data is in.
export default function DraftOutlook({ x, data }) {
  if (!x || x.draftYear !== PROSPECT_CLASS) return null;
  const hist = scoreHistory(data.weeks, x);
  const trend = trendOf(hist);
  const slot = draftSlot(x.boardRank);
  const hit = hitChance(x, data.hitRates, data.tierHits);
  const inn = dataIn(x);
  const score = Math.round(x.overall);
  const since = trend.first ? weekLabel(trend.first.week) : null;
  const rankMove =
    trend.first && trend.first.posRank !== x.posRank
      ? `${trend.first.posRank > x.posRank ? "Up" : "Down"} to ${x.pos}${x.posRank} from ${x.pos}${trend.first.posRank} since ${since}.`
      : trend.first
        ? `Holding at ${x.pos}${x.posRank} since ${since}.`
        : `${x.pos}${x.posRank} in the ${PROSPECT_CLASS} class.`;
  const read = `${rankMove} Projected ${slot ? slotText(slot) : "outside the big board"}${hit ? `, with a ${hit.pct}% shot at a top-12 season` : ""}.`;

  return (
    <div className="card do-card">
      <div className="px-panel-head"><h3>{PROSPECT_CLASS} Draft Outlook</h3><span>Projection</span></div>
      <div className="do-body">
        <div className="do-score">
          <div>
            <small>Model score</small>
            <b>{score}<span>/100</span></b>
          </div>
          <div className="do-score-r">
            {trend.delta !== 0 ? (
              <span className={`do-chip ${trend.delta > 0 ? "up" : "down"}`}>
                {trend.delta > 0 ? "▲" : "▼"} {Math.abs(trend.delta)} since {since}
              </span>
            ) : (
              <span className="do-chip">{trend.first ? `No change since ${since}` : "First week tracked"}</span>
            )}
            <small>
              <b>{x.pos}{x.posRank}</b>
              {trend.first && trend.first.posRank !== x.posRank ? ` · was ${x.pos}${trend.first.posRank}` : ""}
            </small>
          </div>
        </div>

        <div className="do-read">
          <span className={`do-tag ${trend.key}`}>{trend.label}</span>
          <span>{read}</span>
        </div>

        <div className="do-tiles">
          <div>
            <small>Hit chance</small>
            <b style={{ color: "var(--pk)" }}>{hit ? `${hit.pct}%` : "—"}</b>
            <span>{hit ? `Top-12 season · ±${hit.pm}` : "No past comps"}</span>
          </div>
          <div>
            <small>NFL draft</small>
            <b style={{ color: "var(--te)" }}>{slotText(slot)}</b>
            <span>{draftedChance(x.boardRank)}% drafted</span>
          </div>
          <div>
            <small>Our board</small>
            <b>{x.pos}{x.posRank}</b>
            <span>#{x.rank} overall · rookie slot {x.slot}</span>
          </div>
          <div>
            <small>Data in</small>
            <b style={{ color: "var(--rb)" }}>{inn.pct}%</b>
            <span>{inn.missing.length ? `Waiting on ${inn.missing.join(", ")}` : "Waiting on draft capital"}</span>
          </div>
        </div>

        <div className="do-weeks">
          <div className="do-weeks-head">
            <small>Score by week</small>
            <span>{hist.length} {hist.length === 1 ? "week" : "weeks"}</span>
          </div>
          {hist.length > 1 ? (
            <div className="do-week-row">
              {hist.map((h, i) => {
                const prev = hist[i - 1];
                const d = prev ? h.score - prev.score : 0;
                return (
                  <div key={h.week}>
                    <small>{weekLabel(h.week)}</small>
                    <b className={d > 0 ? "up" : d < 0 ? "down" : ""}>{h.score}</b>
                    <span>{x.pos}{h.posRank}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              Tracking started the week of {hist[0] ? weekLabel(hist[0].week) : "today"}. Each week you open the app saves a snapshot here, so movement shows up from next week.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
