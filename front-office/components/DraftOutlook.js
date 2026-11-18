"use client";

import { PROSPECT_CLASS } from "@/lib/prospects";
import { draftSlot, draftedChance, hitChance } from "@/lib/prospectTrend";

const VOLUME = { QB: ["pass attempts", "pass attempts"], RB: ["carries", "carries"], WR: ["targets", "pass attempts"], TE: ["targets", "pass attempts"] };

// The coming class's draft projection: hit chance, draft slot, landing spot and early NFL production.
export default function DraftOutlook({ x, data }) {
  if (!x || x.draftYear !== PROSPECT_CLASS) return null;
  const slot = draftSlot(x.projPick);
  const hit = hitChance(x, data.hitRates, data.tierHits);
  const { landing: team, early } = x;
  const range = early ? (early.to >= 999 ? `picks ${early.from}+` : `picks ${early.from}–${early.to}`) : "";

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
          <span>{slot ? `No. ${slot.overall} overall · ` : ""}{draftedChance(x.projPick)}% drafted</span>
        </div>
        <div>
          <small>Landing spot</small>
          <b style={{ fontSize: "1.1rem" }}>{team ? team.team : "No team yet"}</b>
          <span>{team ? `Jordan Reid mock, 18 Nov${team.via ? ` · ${team.via}` : ""}` : "Only first-round picks have a team"}</span>
        </div>
        <div>
          <small>Early production</small>
          <b style={{ fontSize: "1.1rem" }}>{early ? `${early.y1Top24}% Yr 1 · ${early.y2Top24}% Yr 2` : "—"}</b>
          <span>{early ? `Top-24 season · ${early.n} past ${x.pos}s at ${range} · ${early.y1Ppg} PPG as rookies` : "Needs a projected pick"}</span>
        </div>
      </div>
      {team?.leader && (
        <p className="muted small" style={{ margin: 0, padding: "0 1.1rem 1.1rem" }}>
          {team.leader} leads this {x.pos} room with {team.share}% of the team's {VOLUME[x.pos][0]} in 2026. The team ranks No. {team.volumeRank} of 32 in {VOLUME[x.pos][1]}.
        </p>
      )}
    </div>
  );
}
