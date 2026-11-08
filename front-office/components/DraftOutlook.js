"use client";

import { PROSPECT_CLASS } from "@/lib/prospects";
import { draftSlot, draftedChance, hitChance } from "@/lib/prospectTrend";

// The coming class's draft projection: top-12 hit chance and projected NFL draft slot.
export default function DraftOutlook({ x, data }) {
  if (!x || x.draftYear !== PROSPECT_CLASS) return null;
  const slot = draftSlot(x.boardRank);
  const hit = hitChance(x, data.hitRates, data.tierHits);

  return (
    <div className="card do-card">
      <div className="px-panel-head"><h3>{PROSPECT_CLASS} Draft Outlook</h3><span>Projection</span></div>
      <div className="do-tiles">
        <div>
          <small>Hit chance</small>
          <b style={{ color: "var(--pk)" }}>{hit ? `${hit.pct}%` : "—"}</b>
          <span>{hit ? `Top-12 season · ±${hit.pm}` : "No past comps"}</span>
        </div>
        <div>
          <small>NFL draft</small>
          <b style={{ color: "var(--te)" }}>{slot ? `Rd ${slot.round} · pick ${slot.pick}` : "Undrafted"}</b>
          <span>{draftedChance(x.boardRank)}% drafted</span>
        </div>
      </div>
    </div>
  );
}
