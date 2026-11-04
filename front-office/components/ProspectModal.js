"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, Img } from "./ui";
import { CompPanel, CompRow, GradesPanel, HeadToHead, HypePanel, Monogram, SeasonTable, TierBadge, TierHitPanel, prospectBio } from "./prospects";
import { POS_VAR } from "@/lib/model";
import { closestProfiles, espnUrl } from "@/lib/prospects";
import { BOARD_SOURCES } from "@/lib/rookieBoards";
import { IDP_POSITIONS } from "@/lib/mockDraft";

const initials = (name) => name.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
const schoolAbbr = (school) => (school || "").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
// Past prospects (comps) live on the prospect board, so they open there.
const openReport = (id) => window.open(`/?p=${encodeURIComponent(id)}`, "_blank");

function Boards({ p, teams }) {
  const idp = IDP_POSITIONS.includes(p.pos);
  const mockPick = (r) => `${Math.ceil(r / teams)}.${String(((r - 1) % teams) + 1).padStart(2, "0")}`;
  if (idp || p.custom) return null;
  return (
    <div>
      <div className="card-title" style={{ marginBottom: "0.6rem" }}>
        <h3>Rookie Boards</h3>
        <span className="muted small">Where the outside boards have him</span>
      </div>
      <div className="md-scout-src">
        {BOARD_SOURCES.map((b) => {
          const rank = p.ranks?.[b.key];
          return (
            <a key={b.key} href={b.url} target="_blank" rel="noopener noreferrer">
              <span>{b.label}<small>{b.sub}</small></span>
              <b>{rank ? (b.mock ? mockPick(rank) : `#${rank}`) : "Not listed"}</b>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// The mock draft's player window: the same layout as the NFL player view, with the prospect's
// report-card summary where an NFL player has his season.
export default function ProspectModal({ p, data, pool, espnId, side, status, teams = 12, canDraft, onDraft, queued, onQueue, watched, onWatch, onOpen, onClose }) {
  const x = p.x;
  const [tab, setTab] = useState("overview");
  const [vs, setVs] = useState(null);
  const comps = useMemo(
    () => (x ? { past: closestProfiles(x, data.history.filter((y) => y.draftYear !== x.draftYear), 6), cls: closestProfiles(x, data.prospects) } : null),
    [x, data],
  );
  const other = vs ? [...data.prospects, ...data.history].find((y) => y.id === vs) : null;
  // Classmates in the mock pool open right here; past players open their report card.
  const openComp = (id) => {
    const inPool = pool.find((y) => y.x?.id === id);
    if (inPool) onOpen(inPool);
    else openReport(id);
  };
  const compare = (id) => {
    setVs(id);
    if (id) setTimeout(() => document.getElementById("pm-h2h")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const color = POS_VAR[p.pos] || "var(--k)";
  const idp = IDP_POSITIONS.includes(p.pos);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const tabs = x
    ? [["overview", "Overview"], ["comps", "Comps"], ["college", "College Production"], ["boards", "Rookie Boards"]]
    : [["overview", "Overview"]];
  const link = espnId || x?.espnId;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <aside className="modal-side">
          <h4>{side.title}</h4>
          {side.list.map((y) => (
            <button key={y.id} className={`side-player${y.id === p.id ? " on" : ""}`} onClick={() => onOpen(y)}>
              {y.x ? <Monogram x={y.x} size={32} /> : <span className="md-mono" style={{ "--c": POS_VAR[y.pos] }}>{y.name[0]}</span>}
              <span style={{ minWidth: 0 }}>
                <span className="pname" style={{ display: "block", fontSize: "0.82rem" }}>{y.name}</span>
                <span className="muted small">{y.pos} · {y.school || "—"}{y.adp ? ` · ADP ${y.adp}` : ""}</span>
              </span>
            </button>
          ))}
          {!side.list.length && <p className="muted small">Nobody else here yet.</p>}
        </aside>

        <div className="modal-main">
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>

          <div className="hero" style={{ "--c": color }}>
            <span className="hero-school" aria-hidden="true">{schoolAbbr(p.school)}</span>
            {p.img ? (
              <Img src={p.img} className="hero-photo" alt={p.name} />
            ) : (
              <span className="hero-photo hero-mono" style={{ "--s": p.color || color }}>{initials(p.name)}</span>
            )}
            <div className="hero-info">
              <span className="hero-owner">{status}</span>
              <h2>{p.name}</h2>
              <div className="hero-sub">
                <span>{p.pos} – {p.school || "School unknown"}</span>
                {x && <span><TierBadge tier={x.tier} small /></span>}
                {x && <span>{x.archetype}</span>}
                {x && <span>Age {x.draftAge.toFixed(1)} on draft day</span>}
              </div>
              <div className="hero-stats">
                <div><small>BGM Overall</small><b>{x ? x.overall.toFixed(1) : "—"}</b></div>
                <div><small>{p.pos} Grade</small><b>{x ? x.grade.toFixed(2) : "—"}</b></div>
                <div><small>Class Rank</small><b>{x ? `${x.pos}${x.posRank}` : idp && p.idpRank ? `${p.pos}${p.idpRank}` : "—"}</b></div>
                <div><small>Mock ADP</small><b>{p.adp ?? "—"}</b></div>
                <div><small>Consensus</small><b>{p.cons ?? "—"}</b></div>
                <div><small>NFL Board</small><b>{p.nfl ? `#${p.nfl}` : "—"}</b></div>
              </div>
              <div className="hero-actions">
                {canDraft && (
                  <button className="btn primary" onClick={() => onDraft(p)}>
                    <Icon name="draft" size={16} /> Draft {p.name.split(" ").slice(-1)[0]}
                  </button>
                )}
                {onQueue && <button className="btn" onClick={() => onQueue(p.id)}>{queued ? "✓ In queue" : "+ Queue"}</button>}
                {onWatch && <button className="btn" onClick={() => onWatch(p.id)}>{watched ? "★ Watching" : "☆ Watch"}</button>}
                {x && <button className="btn" onClick={() => openReport(x.id)}>Full report card ↗</button>}
                {link && <a className="btn" href={espnUrl(link)} target="_blank" rel="noopener noreferrer">ESPN profile ↗</a>}
              </div>
            </div>
          </div>

          {tabs.length > 1 && (
            <div className="tabs">
              {tabs.map(([k, l]) => (
                <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
          )}

          <div className="modal-body">
            {tab === "overview" && (
              <div className="grid" style={{ gap: "1.2rem" }}>
                {x ? (
                  <>
                    <div className="px-bio" style={{ "--s": x.color }}>
                      {prospectBio(x).map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
                    </div>
                    <HypePanel x={x} hypeCard={data.hypeCard} />
                    <CompPanel x={x} history={data.history} onOpen={openComp} />
                    <div className="px-two">
                      <GradesPanel x={x} />
                      <TierHitPanel x={x} hitRates={data.hitRates} tierHits={data.tierHits} />
                    </div>
                    {x.notes && <p className="muted small" style={{ margin: 0 }}>{x.notes}</p>}
                  </>
                ) : (
                  <>
                    <Boards p={p} teams={teams} />
                    <p className="muted small" style={{ margin: 0 }}>
                      {idp
                        ? "The BGM Prospect Score grades QBs, RBs, WRs and TEs only, so defenders are ranked by the NFL Mock Draft DB consensus big board."
                        : p.custom
                          ? "Added by hand in Player Pool, so there's nothing on file for this player."
                          : "No college stats on file yet, so there's no BGM report card. Add the player to public/data/prospects_2027.csv and prospect_seasons.csv to grade them."}
                    </p>
                  </>
                )}
              </div>
            )}

            {tab === "comps" && x && (
              <div className="grid" style={{ gap: "1.2rem" }}>
                <div className="px-two">
                  <div className="card px-panel">
                    <div className="px-panel-head"><h3>Historical Comps</h3><span>Closest past {x.pos} grade profiles · select VS to compare</span></div>
                    {comps.past.length === 0 && <div className="empty">No past {x.pos}s with enough data to compare.</div>}
                    {comps.past.map(({ y, d }) => (
                      <CompRow key={y.id} y={y} d={d} vs={vs} setVs={compare} onOpen={openComp} sub={`${y.school} · pick ${y.pick}`} />
                    ))}
                  </div>
                  <div className="card px-panel">
                    <div className="px-panel-head"><h3>Closest in Class</h3><span>{x.draftYear} {x.pos}s · select VS to compare</span></div>
                    {comps.cls.length === 0 && <div className="empty">No other {x.pos}s in this class.</div>}
                    {comps.cls.map(({ y, d }) => (
                      <CompRow key={y.id} y={y} d={d} vs={vs} setVs={compare} onOpen={openComp} sub={`${y.school} · ${y.archetype}`} />
                    ))}
                  </div>
                </div>
                {other && (
                  <div id="pm-h2h">
                    <HeadToHead x={x} y={other} tierHits={data.tierHits} onClose={() => setVs(null)} />
                  </div>
                )}
              </div>
            )}

            {tab === "college" && x && <SeasonTable x={x} />}

            {tab === "boards" && x && <Boards p={p} teams={teams} />}
          </div>
        </div>
      </div>
    </div>
  );
}
