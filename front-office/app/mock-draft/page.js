"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Icon, Img } from "@/components/ui";
import { Monogram, TierBadge } from "@/components/prospects";
import { heightLabel, parseCsv, POS_VAR } from "@/lib/model";
import { PROSPECT_CLASS, espnUrl, loadProspectData, slug } from "@/lib/prospects";
import { BOARD_SOURCES, mergeBoards } from "@/lib/rookieBoards";
import {
  ALL_POSITIONS, CPU_SPEEDS, IDP_POSITIONS, CPU_STYLES, DEFAULT_SETTINGS, RANKINGS, ROUND_COUNTS, SCORING, TEAM_COUNTS, TIMERS,
  MAX_ROUNDS, autoChoice, buildPool, cpuChoice, defaultTeams, draftProfile, leagueSetup, leanSummary, normPos, pickLabel, pickOrder,
  positionsFor, smartChoice, teamNeeds, timerLabel,
} from "@/lib/mockDraft";

// Each outside board's rank for a player, for the consensus column's tooltip. Mocks read as picks.
const boardLine = (p) =>
  BOARD_SOURCES.filter((b) => p.ranks?.[b.key])
    .map((b) => `${b.label}: ${b.mock ? `${Math.ceil(p.ranks[b.key] / 12)}.${String(((p.ranks[b.key] - 1) % 12) + 1).padStart(2, "0")}` : `#${p.ranks[b.key]}`}`)
    .join("\n") || undefined;

// The whole mock lives in this browser, so a refresh (or a trip to a report card) picks up where you left off.
const SAVE_KEY = `bgm-mock-${PROSPECT_CLASS}`;
const fresh = () => ({
  settings: DEFAULT_SETTINGS,
  teams: defaultTeams(DEFAULT_SETTINGS.teams),
  claimed: [],
  owners: {}, // board cell -> team index, for traded picks
  picks: {}, // board cell -> { id, keeper, seq }
  status: "setup", // setup | drafting | paused | done
  queue: [],
  watch: [],
  custom: [],
  autopick: false,
  sound: true,
  sync: true, // follow the connected Sleeper league's real picks
  leagueId: null, // league the board was last loaded from
});

const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const splitName = (name) => {
  const parts = name.split(" ");
  return [parts[0], parts.slice(1).join(" ")];
};

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {}
}

function Toggle({ on, onChange, label, sub }) {
  return (
    <label className="md-toggle">
      <button type="button" className={`md-switch${on ? " on" : ""}`} onClick={() => onChange(!on)} aria-pressed={on}>
        <span />
      </button>
      {label && (
        <span>
          <b>{label}</b>
          {sub && <small>{sub}</small>}
        </span>
      )}
    </label>
  );
}

function SegRow({ options, value, onChange, disabled }) {
  return (
    <div className={`md-seg${disabled ? " disabled" : ""}`}>
      {options.map((o) => (
        <button key={o.v} type="button" className={value === o.v ? "on" : ""} onClick={() => !disabled && onChange(o.v)} disabled={disabled}>
          <b>{o.a}</b>
          {o.b && <small>{o.b}</small>}
        </button>
      ))}
    </div>
  );
}

function SettingsModal({ state, locked, league, onApply, onClose, tab, setTab }) {
  const [s, setS] = useState(state.settings);
  const [teams, setTeams] = useState(state.teams);
  const [claimed, setClaimed] = useState(state.claimed);
  const [owners, setOwners] = useState(state.owners);
  const [custom, setCustom] = useState(state.custom);
  const [add, setAdd] = useState({ name: "", pos: "WR", school: "" });
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));

  const resize = (n) => {
    set("teams", n);
    setTeams((t) => defaultTeams(n, t));
    setClaimed((c) => c.filter((i) => i < n));
    setOwners({});
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= teams.length) return;
    const next = [...teams];
    [next[i], next[j]] = [next[j], next[i]];
    setTeams(next);
    setClaimed((c) => c.map((x) => (x === i ? j : x === j ? i : x)));
    setOwners({});
  };
  const shuffle = () => {
    const idx = teams.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    setTeams(idx.map((i) => teams[i]));
    setClaimed((c) => c.map((x) => idx.indexOf(x)));
    setOwners({});
  };

  const [sync, setSync] = useState(state.sync);
  const [leagueId, setLeagueId] = useState(state.leagueId);
  // A connected Sleeper league brings its teams, its 2027 rookie draft order and any traded picks.
  const fromLeague = () => {
    const l = leagueSetup(league, PROSPECT_CLASS);
    if (!l) return;
    setS((x) => ({ ...x, ...l.settings }));
    setTeams(l.teams);
    setOwners(l.owners);
    setClaimed(l.claimed);
    setLeagueId(league.league.id);
  };
  const officialOrder = league?.picks?.some((p) => p.season === PROSPECT_CLASS && p.officialSlot);

  return (
    <div className="md-modal-back" onMouseDown={onClose}>
      <div className="md-modal" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="md-modal-nav">
          {[
            ["general", "General Settings"],
            ["roster", "Roster Settings"],
            ["order", "Draft Order"],
            ["pool", "Player Pool"],
          ].map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
          <button className="md-modal-x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </nav>
        <div className="md-modal-body">
          {locked && <p className="md-lock">The draft has started. Restart it from the menu to change teams, rounds, draft type or order.</p>}
          {tab === "general" && (
            <>
              <h3>General Draft Settings</h3>
              <p className="muted small">Set number of teams, timer and how the CPUs rank the {PROSPECT_CLASS} class</p>
              <label className="md-label">Draft name</label>
              <input className="md-line" value={s.name} placeholder="Enter a custom name for your draft" onChange={(e) => set("name", e.target.value)} />

              <label className="md-label">Draft type</label>
              <SegRow
                disabled={locked}
                value={s.type}
                onChange={(v) => set("type", v)}
                options={[{ v: "snake", a: "Snake", b: "Default" }, { v: "linear", a: "Linear", b: "Non-snaking" }]}
              />

              <label className="md-label">Scoring (for rankings)</label>
              <div className="md-radios">
                {SCORING.map((o) => (
                  <label key={o.key} className="md-radio">
                    <input type="radio" checked={s.scoring === o.key} onChange={() => set("scoring", o.key)} />
                    <span />
                    {o.label}
                  </label>
                ))}
              </div>

              <label className="md-label">Teams</label>
              <SegRow disabled={locked} value={s.teams} onChange={resize} options={TEAM_COUNTS.map((n) => ({ v: n, a: n, b: "Teams" }))} />

              <label className="md-label">Time per pick</label>
              <SegRow value={s.timer} onChange={(v) => set("timer", v)} options={TIMERS.map((t) => ({ v: t.s, a: t.a, b: t.b }))} />
              <Toggle on={s.cpuAutopick} onChange={(v) => set("cpuAutopick", v)} label="CPU Autopick" sub="When you run out of time." />

              <label className="md-label">Rankings the CPUs draft from</label>
              <SegRow value={s.rankings} onChange={(v) => set("rankings", v)} options={RANKINGS.map((r) => ({ v: r.key, a: r.label, b: r.sub }))} />

              <label className="md-label">CPU draft style</label>
              <SegRow value={s.cpuStyle} onChange={(v) => set("cpuStyle", v)} options={CPU_STYLES.map((r) => ({ v: r.key, a: r.label, b: r.sub }))} />
              {s.cpuStyle === "smart" && (
                <p className="muted small">
                  {league
                    ? `Each CPU drafts like its manager has in ${league.league.name}'s past rookie drafts: the positions they favour, when this league takes each position, and their roster needs today.`
                    : "Connect a Sleeper league to use its draft history and roster needs. Without one, Smart CPUs follow ADP with light randomness."}
                </p>
              )}

              <label className="md-label">IDP</label>
              <Toggle on={s.idp} onChange={(v) => set("idp", v)} label="Include IDP (DL, LB, DB)" sub={`Adds the ${PROSPECT_CLASS} defenders from the NFL Mock Draft DB consensus big board, in board order.`} />

              <label className="md-label">CPU pick speed</label>
              <SegRow value={s.cpuSpeed} onChange={(v) => set("cpuSpeed", v)} options={CPU_SPEEDS.map((r) => ({ v: r.key, a: r.label, b: `${r.ms / 1000}s` }))} />

              <div className="md-toggles">
                <Toggle
                  on={s.thirdRoundReversal}
                  onChange={(v) => !locked && set("thirdRoundReversal", v)}
                  label="Third Round Reversal"
                  sub="Reverses the direction of the snake draft starting from the third round."
                />
                <Toggle on={s.alphabetical} onChange={(v) => set("alphabetical", v)} label="Alphabetical Sort" sub="Sort players alphabetically instead of by ADP." />
              </div>
            </>
          )}

          {tab === "roster" && (
            <>
              <h3>Roster Settings</h3>
              <p className="muted small">How many rounds, and the most players of each position a team can take (0 = no limit)</p>
              <label className="md-label">Rounds</label>
              <SegRow disabled={locked} value={s.rounds} onChange={(v) => set("rounds", v)} options={ROUND_COUNTS.map((n) => ({ v: n, a: n, b: n === 1 ? "Round" : "Rounds" }))} />
              <label className="md-label">Position limits</label>
              <div className="md-limits">
                {positionsFor(s).map((p) => (
                  <label key={p} className="md-limit">
                    <span className="md-badge" style={{ "--c": POS_VAR[p] }}>{p}</span>
                    <input
                      type="number"
                      min={0}
                      max={s.rounds}
                      className="input"
                      value={s.limits[p]}
                      onChange={(e) => set("limits", { ...s.limits, [p]: Math.max(0, Math.min(s.rounds, Number(e.target.value) || 0)) })}
                    />
                    <small className="muted">{s.limits[p] ? `max ${s.limits[p]}` : "no limit"}</small>
                  </label>
                ))}
              </div>
            </>
          )}

          {tab === "order" && (
            <>
              <h3>Draft Order</h3>
              <p className="muted small">Rename teams, set the order and claim the teams you'll draft for. Unclaimed teams are CPUs.</p>
              <div className="md-order-actions">
                <button className="btn" onClick={shuffle} disabled={locked}><Icon name="refresh" size={15} /> Randomize</button>
                {league && (
                  <button className="btn" onClick={fromLeague} disabled={locked} title="Teams, 2027 pick order and traded picks from your Sleeper league">
                    Reload {league.league.name} picks
                  </button>
                )}
              </div>
              {league && (
                <Toggle
                  on={sync}
                  onChange={setSync}
                  label={`Sync with ${league.league.name}`}
                  sub="Load the league's teams, 2027 order and current pick owners automatically. Turn off for a generic mock."
                />
              )}
              {league && <p className="muted small">League order uses {officialOrder ? "Sleeper's official 2027 draft order" : "a projection from current standings (worst record picks first)"}; traded picks move with their new owner.</p>}
              <div className="md-order">
                {teams.map((t, i) => (
                  <div key={i} className="md-order-row">
                    <span className="md-order-no">{i + 1}</span>
                    {t.avatar && <Img src={t.avatar} className="avatar" />}
                    <input
                      className="input"
                      value={t.name}
                      onChange={(e) => setTeams((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <button className={`md-claim${claimed.includes(i) ? " mine" : ""}`} onClick={() => setClaimed((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))}>
                      {claimed.includes(i) ? "YOU" : "CLAIM"}
                    </button>
                    <button className="md-icon" onClick={() => move(i, -1)} disabled={locked || i === 0} aria-label="Move up">▲</button>
                    <button className="md-icon" onClick={() => move(i, 1)} disabled={locked || i === teams.length - 1} aria-label="Move down">▼</button>
                  </div>
                ))}
              </div>
              {Object.keys(owners).length > 0 && (
                <p className="muted small">{Object.keys(owners).length} traded pick{Object.keys(owners).length === 1 ? "" : "s"} on the board. <button className="md-link" disabled={locked} onClick={() => setOwners({})}>Clear trades</button></p>
              )}
            </>
          )}

          {tab === "pool" && (
            <>
              <h3>Player Pool</h3>
              <p className="muted small">
                The pool is the graded {PROSPECT_CLASS} class plus everyone on the outside rookie boards. Add anyone else here; they go to the back of the board until you draft them.
              </p>
              <div className="md-add">
                <input className="input" placeholder="Player name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
                <select className="select" value={add.pos} onChange={(e) => setAdd({ ...add, pos: e.target.value })}>
                  {ALL_POSITIONS.map((p) => <option key={p}>{p}</option>)}
                </select>
                <input className="input" placeholder="School" value={add.school} onChange={(e) => setAdd({ ...add, school: e.target.value })} />
                <button
                  className="btn"
                  disabled={!add.name.trim()}
                  onClick={() => {
                    setCustom((c) => [...c, { name: add.name.trim(), pos: add.pos, school: add.school.trim() }]);
                    setAdd({ name: "", pos: add.pos, school: "" });
                  }}
                >
                  Add player
                </button>
              </div>
              {custom.map((c, i) => (
                <div key={i} className="md-order-row">
                  <span className="md-badge" style={{ "--c": POS_VAR[c.pos] }}>{c.pos}</span>
                  <b style={{ flex: 1 }}>{c.name}</b>
                  <span className="muted small">{c.school}</span>
                  <button className="md-icon" onClick={() => setCustom((all) => all.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="md-modal-foot">
          <button className="btn primary" onClick={() => onApply({ settings: s, teams, claimed, owners, custom, sync, leagueId })}>UPDATE</button>
        </div>
      </div>
    </div>
  );
}

// Click a board cell before the draft to set a keeper there or hand the pick to another team.
// Players without a BGM grade (defenders, names only on the outside boards, players added by hand)
// still get a card: where every board has them and what's missing.
function ScoutCard({ p, espnId, onClose }) {
  const idp = IDP_POSITIONS.includes(p.pos);
  const sources = BOARD_SOURCES.map((b) => ({ ...b, rank: p.ranks?.[b.key] }));
  const mockPick = (r) => `${Math.ceil(r / 12)}.${String(((r - 1) % 12) + 1).padStart(2, "0")}`;
  return (
    <div className="md-modal-back" onMouseDown={onClose}>
      <div className="md-modal small" onMouseDown={(e) => e.stopPropagation()}>
        <div className="md-modal-body">
          <div className="md-scout-head">
            <span className="md-mono big" style={{ "--c": POS_VAR[p.pos] }}>{p.name[0]}</span>
            <span>
              <h3>{p.name}</h3>
              {espnId && <a className="px-espn" href={espnUrl(espnId)} target="_blank" rel="noopener noreferrer">ESPN profile ↗</a>}
              <small><i style={{ color: POS_VAR[p.pos] }}>{p.pos}</i> {p.school || "School unknown"}</small>
            </span>
          </div>
          <div className="md-scout-stats">
            <div><small>Mock ADP</small><b>{p.adp ?? "—"}</b></div>
            <div><small>Consensus</small><b>{p.cons ?? "—"}</b></div>
            <div><small>NFL Board</small><b>{p.nfl ? `#${p.nfl}` : "—"}</b></div>
            {idp && <div><small>{p.pos} rank</small><b>{p.idpRank ?? "—"}</b></div>}
          </div>
          {!idp && !p.custom && (
            <>
              <label className="md-label">Rookie boards</label>
              <div className="md-scout-src">
                {sources.map((b) => (
                  <a key={b.key} href={b.url} target="_blank" rel="noopener noreferrer">
                    <span>{b.label}<small>{b.sub}</small></span>
                    <b>{b.rank ? (b.mock ? mockPick(b.rank) : `#${b.rank}`) : "Not listed"}</b>
                  </a>
                ))}
              </div>
            </>
          )}
          <p className="muted small">
            {idp
              ? "The BGM Prospect Score grades QBs, RBs, WRs and TEs only, so defenders are ranked by the NFL Mock Draft DB consensus big board."
              : p.custom
                ? "Added by hand in Player Pool, so there's nothing on file for this player."
                : "No college stats on file yet, so there's no BGM report card. Add the player to public/data/prospects_2027.csv and prospect_seasons.csv to grade them."}
          </p>
        </div>
        <div className="md-modal-foot">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function CellModal({ cell, state, pool, drafted, onSave, onClose }) {
  const [q, setQ] = useState("");
  const owner = state.owners[cell.key] ?? cell.col;
  const current = state.picks[cell.key];
  const term = q.trim().toLowerCase();
  const list = pool.filter((p) => !drafted.has(p.id) && (!term || p.name.toLowerCase().includes(term))).slice(0, 30);
  return (
    <div className="md-modal-back" onMouseDown={onClose}>
      <div className="md-modal small" onMouseDown={(e) => e.stopPropagation()}>
        <div className="md-modal-body">
          <h3>Pick {pickLabel(cell)}</h3>
          <label className="md-label">Owned by</label>
          <select className="select" value={owner} onChange={(e) => onSave({ owner: Number(e.target.value) })}>
            {state.teams.map((t, i) => (
              <option key={i} value={i}>{t.name}{i === cell.col ? " (original)" : ""}</option>
            ))}
          </select>
          <label className="md-label">Keeper</label>
          {current ? (
            <p>
              <b>{pool.find((p) => p.id === current.id)?.name || current.id}</b>{" "}
              <button className="md-link" onClick={() => onSave({ keeper: null })}>Remove keeper</button>
            </p>
          ) : (
            <>
              <input className="input" style={{ width: "100%" }} placeholder="Find player" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
              <div className="md-keeper-list">
                {list.map((p) => (
                  <button key={p.id} onClick={() => onSave({ keeper: p.id })}>
                    <span className="md-badge" style={{ "--c": POS_VAR[p.pos] }}>{p.pos}</span>
                    <b>{p.name}</b>
                    <span className="muted small">{p.school} · ADP {p.adp}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="md-modal-foot">
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const SORTS = {
  rk: (p) => p.adp,
  cons: (p) => p.cons ?? 999,
  bgm: (p) => (p.bgm == null ? 999 : -p.bgm),
  nfl: (p) => p.nfl ?? 999,
  age: (p) => p.x?.draftAge ?? 99,
};

export default function MockDraft() {
  const { data: league, leagueQuery } = useApp();
  const [hist, setHist] = useState(null); // the league's past drafts, for Smart CPUs
  const [src, setSrc] = useState(null);
  const [live, setLive] = useState(null); // today's read of the outside boards
  const [error, setError] = useState(false);
  const [st, setSt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [deadline, setDeadline] = useState(null);
  const [rush, setRush] = useState(false);
  const [ui, setUi] = useState({ pos: "ALL", q: "", watchOnly: false, showDrafted: false, sort: "rk", board: "normal", menu: false, settings: null, cell: null, results: null, scout: null });
  const pausedLeft = useRef(null);
  const ring = useRef(null);
  const set = (patch) => setSt((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  const setU = (patch) => setUi((u) => ({ ...u, ...patch }));

  useEffect(() => {
    const csv = (f) => fetch(`/data/${f}`).then((r) => (r.ok ? r.text() : "")).then(parseCsv);
    // The boards snapshot loads first; the live refresh (NFL Mock Draft DB, Dynasty Nerds) swaps in when it lands.
    Promise.all([loadProspectData(), csv(`rookie_boards_${PROSPECT_CLASS}.csv`), csv(`idp_prospects_${PROSPECT_CLASS}.csv`)])
      .then(([d, boards, idp]) => setSrc({ prospects: d.prospects, espnIds: d.espnIds, snapshot: boards, idpCsv: idp }))
      .catch(() => setError(true));
    fetch("/api/rookie-boards")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLive(d))
      .catch(() => {});
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch {}
    const base = fresh();
    if (saved) {
      saved = { ...base, ...saved, settings: { ...base.settings, ...saved.settings, limits: { ...base.settings.limits, ...saved.settings?.limits } } };
      if (saved.status === "drafting") saved.status = "paused";
      saved.settings.rounds = Math.min(MAX_ROUNDS, saved.settings.rounds);
    }
    setSt(saved || base);
  }, []);
  useEffect(() => {
    if (!st) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(st));
    } catch {}
  }, [st]);

  // With a league connected, the board follows its real rookie draft: each slot's original team is the
  // column, and whoever owns the pick now makes the selection.
  useEffect(() => {
    if (!league || !st || !st.sync) return;
    // Boards saved before teams carried their Sleeper user reload once, so Smart CPUs know who's who.
    if (st.leagueId === league.league.id && st.teams.every((t) => "ownerId" in t)) return;
    if (st.status !== "setup" || Object.values(st.picks).some((p) => !p.keeper)) return;
    const l = leagueSetup(league, PROSPECT_CLASS);
    if (!l) return;
    setSt((x) => ({ ...x, settings: { ...x.settings, ...l.settings }, teams: l.teams, owners: l.owners, claimed: l.claimed, picks: {}, leagueId: league.league.id }));
  }, [league, st]);

  // Every past draft in the league (the History page's data), for how each manager drafts.
  useEffect(() => {
    if (!league || !leagueQuery) return;
    let alive = true;
    setHist(null);
    fetch(`/api/history?${leagueQuery}`)
      .then((r) => r.json())
      .then((d) => alive && setHist(d.error ? { drafts: [] } : d))
      .catch(() => alive && setHist({ drafts: [] }));
    return () => {
      alive = false;
    };
  }, [league, leagueQuery]);

  const s = st?.settings || DEFAULT_SETTINGS;
  const synced = !!league && !!st?.sync && st?.leagueId === league.league.id;
  const profile = useMemo(() => (synced && hist ? draftProfile(hist, s) : null), [synced, hist, s]);
  const needs = useMemo(() => (synced ? teamNeeds(league) : {}), [synced, league]);
  const positions = positionsFor(s);
  const order = useMemo(() => pickOrder(s), [s]);
  const boards = useMemo(() => (src ? mergeBoards(src.snapshot, live?.lists, live?.nfl) : []), [src, live]);
  const idp = useMemo(() => {
    if (!src) return [];
    const fromLive = (live?.nfl || []).filter((p) => IDP_POSITIONS.includes(normPos(p.pos)));
    return fromLive.length >= 12
      ? fromLive.map((p, i) => ({ Rank: i + 1, Player: p.name, Position: p.pos, School: p.school, "NFL Board": p.rank }))
      : src.idpCsv;
  }, [src, live]);
  const pool = useMemo(() => (src ? buildPool({ prospects: src.prospects, boards, idp, custom: st?.custom || [] }, s) : []), [src, boards, idp, st?.custom, s]);
  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const picks = st?.picks || {};
  const drafted = useMemo(() => new Set(Object.values(picks).map((p) => p.id)), [picks]);
  const available = useMemo(() => pool.filter((p) => !drafted.has(p.id)), [pool, drafted]);
  const ownerOf = useCallback((c) => st?.owners[c.key] ?? c.col, [st?.owners]);
  const current = st && st.status !== "setup" ? order.find((c) => !picks[c.key]) || null : null;
  const currentOwner = current ? ownerOf(current) : null;
  const mineNow = current != null && st.claimed.includes(currentOwner);
  const teamPlayers = useCallback(
    (t) => order.filter((c) => ownerOf(c) === t && picks[c.key]).map((c) => byId.get(picks[c.key].id)).filter(Boolean),
    [order, ownerOf, picks, byId],
  );
  // Graded players open their report card; everyone else gets the scouting card.
  const openProfile = (p) => {
    if (!p) return;
    if (p.x) window.open(`/?p=${encodeURIComponent(p.id)}`, "_blank");
    else setU({ scout: p.id });
  };
  const locked = !!st && st.status !== "setup" && Object.values(picks).some((p) => !p.keeper);

  const makePick = useCallback((cell, player, why) => {
    if (!player) return;
    setDeadline(null);
    pausedLeft.current = null;
    setSt((x) => {
      if (x.picks[cell.key] || Object.values(x.picks).some((p) => p.id === player.id)) return x;
      const seq = Math.max(0, ...Object.values(x.picks).map((p) => p.seq)) + 1;
      const pick = why?.length ? { id: player.id, seq, why } : { id: player.id, seq };
      return { ...x, picks: { ...x.picks, [cell.key]: pick }, queue: x.queue.filter((id) => id !== player.id) };
    });
  }, []);

  // The draft engine: CPUs pick after a short delay; your picks wait for you (or auto-pick).
  useEffect(() => {
    if (!st || st.status !== "drafting") return;
    if (!current || !available.length) {
      set({ status: "done" });
      setRush(false);
      return;
    }
    const team = teamPlayers(currentOwner);
    if (!mineNow) {
      const ms = rush ? 60 : (CPU_SPEEDS.find((x) => x.key === s.cpuSpeed) || CPU_SPEEDS[2]).ms;
      const t = setTimeout(() => {
        if (s.cpuStyle !== "smart") return makePick(current, cpuChoice(available, team, s));
        const owner = st.teams[currentOwner]?.ownerId;
        const pick = smartChoice(available, team, s, { profile, owner, need: needs[owner], round: current.round });
        makePick(current, pick?.player, pick?.why);
      }, ms);
      return () => clearTimeout(t);
    }
    setRush(false);
    if (st.autopick) {
      const t = setTimeout(() => makePick(current, autoChoice(st.queue, available, team, s)), 500);
      return () => clearTimeout(t);
    }
    if (st.sound && ring.current !== current.key) beep();
    ring.current = current.key;
    const left = pausedLeft.current ?? s.timer * 1000;
    pausedLeft.current = null;
    setDeadline(s.timer ? Date.now() + left : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.status, current?.key, mineNow, st?.autopick, rush, available.length]);

  // Pick clock.
  useEffect(() => {
    if (st?.status !== "drafting" || !deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [st?.status, deadline]);
  useEffect(() => {
    if (!deadline || now < deadline || st?.status !== "drafting" || !mineNow) return;
    setDeadline(null);
    if (s.cpuAutopick) makePick(current, autoChoice(st.queue, available, teamPlayers(currentOwner), s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadline]);

  if (error) return <div className="card empty">Couldn't load the prospect data files.</div>;
  if (!st || !src) return <div className="skeleton" style={{ height: 520 }} />;

  const left = deadline ? deadline - now : null;
  const title = s.name || `${s.teams}-team Rookie ${s.type === "snake" ? "Snake" : "Linear"}`;
  const myTeam = st.claimed[0] ?? null;
  const resultsTeam = ui.results ?? myTeam ?? 0;
  const myPlayers = myTeam != null ? teamPlayers(myTeam) : [];
  const myCounts = myPlayers.reduce((c, p) => ((c[p.pos] = (c[p.pos] || 0) + 1), c), {});
  const teamName = (i) => st.teams[i]?.name || `Team ${i + 1}`;

  const start = () => {
    setU({ menu: false });
    if (st.status === "done") return;
    set({ status: "drafting" });
  };
  const pause = () => {
    if (deadline) pausedLeft.current = Math.max(1000, deadline - Date.now());
    setDeadline(null);
    set({ status: "paused" });
  };
  const undo = () => {
    const last = Object.entries(picks).filter(([, p]) => !p.keeper).sort((a, b) => b[1].seq - a[1].seq)[0];
    setU({ menu: false });
    if (!last) return;
    setDeadline(null);
    pausedLeft.current = null;
    const next = { ...picks };
    delete next[last[0]];
    set((x) => ({ picks: next, status: x.status === "setup" ? "setup" : "paused" }));
  };
  const restart = () => {
    setU({ menu: false });
    setDeadline(null);
    setRush(false);
    pausedLeft.current = null;
    set((x) => ({ status: "setup", picks: Object.fromEntries(Object.entries(x.picks).filter(([, p]) => p.keeper)) }));
  };
  const resetAll = () => {
    if (!window.confirm("Reset the mock draft? Settings, teams, keepers, your queue and watchlist go back to the defaults.")) return;
    setU({ menu: false, results: null });
    setDeadline(null);
    setRush(false);
    setSt(fresh());
  };
  const copyResults = () => {
    const lines = order
      .filter((c) => picks[c.key])
      .map((c) => {
        const p = byId.get(picks[c.key].id);
        return `${pickLabel(c)} ${teamName(ownerOf(c))}: ${p?.name || picks[c.key].id} (${p?.pos || ""}, ${p?.school || ""})${picks[c.key].keeper ? " [keeper]" : ""}`;
      });
    navigator.clipboard?.writeText(`${title}\n${lines.join("\n")}`);
    setU({ menu: false });
  };
  const toggleClaim = (i) => set((x) => ({ claimed: x.claimed.includes(i) ? x.claimed.filter((c) => c !== i) : [...x.claimed, i] }));
  const toggleIn = (k, id) => set((x) => ({ [k]: x[k].includes(id) ? x[k].filter((v) => v !== id) : [...x[k], id] }));
  const moveQueue = (i, d) =>
    set((x) => {
      const q = [...x.queue];
      const j = i + d;
      if (j < 0 || j >= q.length) return {};
      [q[i], q[j]] = [q[j], q[i]];
      return { queue: q };
    });
  const draftNow = (p) => mineNow && st.status === "drafting" && makePick(current, p);

  const applySettings = (next) => {
    const n = next.settings.teams;
    const valid = new Set(pickOrder(next.settings).map((c) => c.key));
    set((x) => ({
      ...next,
      teams: defaultTeams(n, next.teams),
      picks: Object.fromEntries(Object.entries(x.picks).filter(([k]) => valid.has(k))),
      owners: Object.fromEntries(Object.entries(next.owners).filter(([k, v]) => valid.has(k) && v < n)),
    }));
    setU({ settings: null });
  };
  const saveCell = (cell, { owner, keeper }) =>
    set((x) => {
      const out = {};
      if (owner !== undefined) {
        const owners = { ...x.owners };
        if (owner === cell.col) delete owners[cell.key];
        else owners[cell.key] = owner;
        out.owners = owners;
      }
      if (keeper !== undefined) {
        const p = { ...x.picks };
        if (keeper) p[cell.key] = { id: keeper, keeper: true, seq: 0 };
        else delete p[cell.key];
        out.picks = p;
      }
      return out;
    });

  // Player list
  const term = ui.q.trim().toLowerCase();
  let rows = (ui.showDrafted ? pool : available).filter(
    (p) => (ui.pos === "ALL" || p.pos === ui.pos) && (!ui.watchOnly || st.watch.includes(p.id)) && (!term || p.name.toLowerCase().includes(term) || (p.school || "").toLowerCase().includes(term)),
  );
  rows = s.alphabetical ? [...rows].sort((a, b) => a.name.localeCompare(b.name)) : [...rows].sort((a, b) => SORTS[ui.sort](a) - SORTS[ui.sort](b) || a.adp - b.adp);

  const log = order
    .filter((c) => picks[c.key])
    .sort((a, b) => picks[b.key].seq - picks[a.key].seq || b.overall - a.overall);
  const draftedCount = Object.keys(picks).length;
  const statusText =
    st.status === "done"
      ? "Draft complete"
      : current
        ? `${pickLabel(current)} · ${mineNow ? "You're on the clock" : `${teamName(currentOwner)} on the clock`}`
        : "";

  return (
    <div className="md-room">
      <header className="md-head">
        <div className="md-title">
          <h1>{title}</h1>
          <p>
            {timerLabel(s.timer)} Per Pick · {s.rounds} Rounds · {PROSPECT_CLASS} Rookie Class
            {s.thirdRoundReversal && s.type === "snake" ? " · 3RR" : ""} · {(SCORING.find((x) => x.key === s.scoring) || SCORING[0]).label}
          </p>
        </div>
        <div className="md-center">
          {st.status === "setup" ? (
            <button className="md-start" onClick={start}>
              <Icon name="draft" size={18} /> START DRAFT
            </button>
          ) : st.status === "done" ? (
            <button className="md-start done" onClick={restart}>
              <Icon name="refresh" size={18} /> DRAFT AGAIN
            </button>
          ) : (
            <div className={`md-clock${mineNow ? " mine" : ""}`}>
              <span className="md-clock-text">{statusText}</span>
              {left != null && <b className={left < 10000 ? "low" : ""}>{clock(left)}</b>}
              {st.status === "drafting" ? (
                <button onClick={pause}>Pause</button>
              ) : (
                <button onClick={start}>Resume</button>
              )}
            </div>
          )}
        </div>
        <div className="md-tools">
          {st.status !== "setup" && st.status !== "done" && !mineNow && st.claimed.length > 0 && (
            <button className="md-tool wide" onClick={() => { setRush(true); if (st.status !== "drafting") set({ status: "drafting" }); }} title="Let the CPUs pick instantly until it's your turn">
              Sim to my pick
            </button>
          )}
          <button className={`md-tool${st.sound ? " on" : ""}`} onClick={() => set({ sound: !st.sound })} title={st.sound ? "Sound on" : "Sound off"}>
            <Icon name={st.sound ? "sound" : "mute"} size={18} />
          </button>
          <button className="md-tool" onClick={() => setU({ settings: "general", menu: false })} title="Draft settings">
            <Icon name="gear" size={18} />
          </button>
          <div className="md-menu-wrap">
            <button className="md-tool" onClick={() => setU({ menu: !ui.menu })} title="More">
              <Icon name="dots" size={18} />
            </button>
            {ui.menu && (
              <div className="md-menu" onMouseLeave={() => setU({ menu: false })}>
                <button onClick={() => setU({ settings: "general", menu: false })}><b>Draft Settings</b><small>Draft order, timer, scoring, and more</small></button>
                {st.status === "setup" && <button onClick={start}><b>Start Draft</b><small>Finalize settings and start the draft now</small></button>}
                <button onClick={undo} disabled={!log.some((c) => !picks[c.key].keeper)}><b>Undo Last Pick</b><small>Take back the most recent pick</small></button>
                <button onClick={restart}><b>Restart Draft</b><small>Clear every pick but keep settings and keepers</small></button>
                <button onClick={copyResults} disabled={!draftedCount}><b>Copy Results</b><small>Copy the draft board as text</small></button>
                <button onClick={resetAll}><b>Reset Mock</b><small>Back to the defaults (your league's picks when synced)</small></button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`md-board-wrap ${ui.board}`}>
        <div className="md-board" style={{ "--n": s.teams }}>
          {st.teams.map((t, i) => (
            <div key={i} className="md-team">
              <button className={`md-claim${st.claimed.includes(i) ? " mine" : ""}`} onClick={() => toggleClaim(i)}>
                {st.claimed.includes(i) ? "YOU" : "CLAIM"}
              </button>
              <span className="md-team-name">
                {t.avatar && <Img src={t.avatar} className="md-team-av" />}
                {t.name}
              </span>
            </div>
          ))}
          {order
            .slice()
            .sort((a, b) => a.round - b.round || a.col - b.col)
            .map((c) => {
              const pk = picks[c.key];
              const p = pk ? byId.get(pk.id) : null;
              const owner = ownerOf(c);
              const isCurrent = current?.key === c.key && st.status !== "done";
              const arrow = c.last ? (c.round < s.rounds ? "↓" : "") : c.rev ? "←" : "→";
              const [first, last] = p ? splitName(p.name) : ["", ""];
              return (
                <button
                  key={c.key}
                  className={`md-cell${p ? " picked" : ""}${isCurrent ? " now" : ""}${st.claimed.includes(owner) ? " mine" : ""}`}
                  style={p ? { "--c": POS_VAR[p.pos] } : undefined}
                  onClick={() => {
                    if (st.status === "setup") setU({ cell: c });
                    else openProfile(p);
                  }}
                  title={st.status === "setup" ? "Set a keeper or trade this pick" : p ? p.name : undefined}
                >
                  <span className="md-cell-no">{pickLabel(c)}</span>
                  {p ? (
                    <>
                      <span className="md-cell-first">{first}</span>
                      <span className="md-cell-last">{last}</span>
                      <span className="md-cell-meta">{p.pos} · {p.school}{pk.keeper ? " · K" : ""}</span>
                    </>
                  ) : isCurrent ? (
                    <span className="md-cell-clock">{mineNow ? "YOUR PICK" : "ON THE CLOCK"}{left != null && <b>{clock(left)}</b>}</span>
                  ) : null}
                  {owner !== c.col && <span className={`md-cell-via${st.claimed.includes(owner) ? " mine" : ""}`} title={`${teamName(c.col)}'s pick, now owned by ${teamName(owner)}`}>→ {teamName(owner)}</span>}
                  <span className="md-cell-arrow">{arrow}</span>
                </button>
              );
            })}
        </div>
        <div className="md-board-size">
          <button onClick={() => setU({ board: ui.board === "tall" ? "normal" : "short" })} aria-label="Shrink board">⌃</button>
          <button onClick={() => setU({ board: ui.board === "short" ? "normal" : "tall" })} aria-label="Grow board">⌄</button>
        </div>
      </div>

      <section className="md-panels">
        <div className="md-panel md-players">
          <div className="md-filters">
            <div className="md-find">
              <Icon name="search" size={15} />
              <input placeholder="Find player" value={ui.q} onChange={(e) => setU({ q: e.target.value })} />
            </div>
            <div className="md-pos-tabs">
              {["ALL", ...positions].map((p) => (
                <button key={p} className={ui.pos === p ? "on" : ""} style={p !== "ALL" ? { "--c": POS_VAR[p] } : undefined} onClick={() => setU({ pos: p })}>
                  <b>{p}</b>
                  <small>
                    {p === "ALL" ? `${myPlayers.length}/${s.rounds}` : `${myCounts[p] || 0}${s.limits[p] ? `/${s.limits[p]}` : ""}`}
                  </small>
                </button>
              ))}
            </div>
            <label className="md-check">
              <input type="checkbox" checked={ui.watchOnly} onChange={(e) => setU({ watchOnly: e.target.checked })} />
              <span /> WATCHLIST
            </label>
            <label className="md-check">
              <input type="checkbox" checked={ui.showDrafted} onChange={(e) => setU({ showDrafted: e.target.checked })} />
              <span /> SHOW DRAFTED
            </label>
          </div>
          <div className="md-table-wrap">
            <table className="md-table">
              <thead>
                <tr>
                  <th />
                  {[["rk", "RK"]].map(([k, l]) => <th key={k} className={`sortable${ui.sort === k ? " on" : ""}`} onClick={() => setU({ sort: k })}>{l}</th>)}
                  <th className="left">PLAYER</th>
                  <th />
                  <th>TIER</th>
                  {[["cons", "CONS"], ["bgm", "BGM"], ["nfl", "NFL"], ["age", "AGE"]].map(([k, l]) => (
                    <th key={k} className={`sortable${ui.sort === k ? " on" : ""}`} onClick={() => setU({ sort: k })} title={{ cons: "Consensus of the outside rookie boards (hover a number for each source)", bgm: "BGM Prospect Score (Overall)", nfl: "NFL big-board rank (projected draft capital)", age: "Age on draft day" }[k]}>
                      {l}
                    </th>
                  ))}
                  <th>HT/WT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const taken = drafted.has(p.id);
                  const queued = st.queue.includes(p.id);
                  return (
                    <tr key={p.id} className={taken ? "taken" : ""}>
                      <td>
                        {taken ? null : mineNow && st.status === "drafting" ? (
                          <button className="md-draft-btn" onClick={() => draftNow(p)}>DRAFT</button>
                        ) : (
                          <button className={`md-plus${queued ? " on" : ""}`} onClick={() => toggleIn("queue", p.id)} title={queued ? "Remove from queue" : "Add to queue"}>
                            {queued ? "✓" : "+"}
                          </button>
                        )}
                      </td>
                      <td className="num">{p.adp}</td>
                      <td className="left">
                        <div className="md-pl">
                          {p.x ? <Monogram x={p.x} size={30} /> : <span className="md-mono" style={{ "--c": POS_VAR[p.pos] }}>{p.name[0]}</span>}
                          <span>
                            {p.x ? (
                              <a href={`/?p=${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer" className="md-pl-name">{p.name}</a>
                            ) : (
                              <button className="md-name-btn md-pl-name" onClick={() => openProfile(p)}>{p.name}</button>
                            )}
                            <small>
                              <i style={{ color: POS_VAR[p.pos] }}>{p.pos}</i> {p.school}
                              {p.custom ? " · added" : ""}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <button className={`md-star${st.watch.includes(p.id) ? " on" : ""}`} onClick={() => toggleIn("watch", p.id)} title="Watchlist">
                          <Icon name="star" size={14} />
                        </button>
                      </td>
                      <td>{p.x ? <TierBadge tier={p.x.tier} small /> : <span className="muted">—</span>}</td>
                      <td className="num" title={boardLine(p)}>{p.cons ?? "—"}</td>
                      <td className="num">{p.bgm != null ? p.bgm.toFixed(1) : "—"}</td>
                      <td className="num">{p.nfl ?? "—"}</td>
                      <td className="num">{p.x ? p.x.draftAge.toFixed(1) : "—"}</td>
                      <td className="num">{p.x ? `${heightLabel(p.x.height)} ${p.x.weight || ""}` : "—"}</td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr><td colSpan={10} className="muted md-none">No players match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="md-panel">
          <div className="md-panel-head">
            <h4>QUEUE</h4>
            <div className="md-auto">
              AUTO-PICK
              <Toggle on={st.autopick} onChange={(v) => set({ autopick: v })} />
            </div>
          </div>
          {st.queue.length ? (
            <div className="md-queue">
              {st.queue.map((id, i) => {
                const p = byId.get(id);
                if (!p) return null;
                return (
                  <div key={id} className="md-q-row">
                    <span className="md-q-no">{i + 1}</span>
                    <span className="md-badge" style={{ "--c": POS_VAR[p.pos] }}>{p.pos}</span>
                    <span className="md-q-name">
                      <button className="md-name-btn" onClick={() => openProfile(p)}><b>{p.name}</b></button>
                      <small>{p.school} · ADP {p.adp}</small>
                    </span>
                    {mineNow && st.status === "drafting" ? (
                      <button className="md-draft-btn" onClick={() => draftNow(p)}>DRAFT</button>
                    ) : (
                      <>
                        <button className="md-icon" onClick={() => moveQueue(i, -1)} aria-label="Up">▲</button>
                        <button className="md-icon" onClick={() => moveQueue(i, 1)} aria-label="Down">▼</button>
                      </>
                    )}
                    <button className="md-icon" onClick={() => toggleIn("queue", id)} aria-label="Remove">✕</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="md-empty">
              <Icon name="draft" size={40} />
              <b>No players in your queue</b>
              <small>Add to queue from player list</small>
            </div>
          )}
          {st.autopick && <p className="md-note">Auto-pick is on: your picks come from the top of this queue, then the best available.</p>}
        </div>

        <div className="md-panel">
          <div className="md-panel-head">
            <h4>RESULTS</h4>
          </div>
          <select className="md-team-select" value={resultsTeam} onChange={(e) => setU({ results: Number(e.target.value) })}>
            {st.teams.map((t, i) => (
              <option key={i} value={i}>{t.name}{st.claimed.includes(i) ? " (you)" : ""}</option>
            ))}
          </select>
          {(() => {
            const owner = st.teams[resultsTeam]?.ownerId;
            const read = leanSummary(profile, owner, positions);
            const need = needs[owner];
            const topNeeds = need ? positions.filter((p) => need[p] >= 0.3).sort((a, b) => need[b] - need[a]).slice(0, 3) : [];
            const mine = order.filter((c) => ownerOf(c) === resultsTeam && picks[c.key] && !picks[c.key].keeper);
            const delta = mine.length ? mine.reduce((sum, c) => sum + (c.overall - (byId.get(picks[c.key].id)?.adp ?? c.overall)), 0) / mine.length : null;
            if (!read && !topNeeds.length && delta == null) return null;
            return (
              <div className="md-scout">
                {topNeeds.length > 0 && (
                  <div><small className="muted">Needs</small>{topNeeds.map((p) => <span key={p} className="md-badge sm" style={{ "--c": POS_VAR[p] }}>{p}</span>)}</div>
                )}
                {read && (
                  <div title={`${read.picks} rookie picks since ${profile.seasons[profile.seasons.length - 1]}, recent seasons weighted more`}>
                    <small className="muted">Drafts</small>
                    {read.top.slice(0, 3).map((t) => <span key={t.pos} className="md-lean"><i style={{ color: POS_VAR[t.pos] }}>{t.pos}</i> {Math.round(t.share * 100)}%</span>)}
                    {s.idp && <span className="md-lean">IDP {Math.round(read.idp * 100)}%</span>}
                  </div>
                )}
                {read?.recent.length > 0 && (
                  <div className="md-scout-recent">
                    <small className="muted">Last picks</small>
                    {read.recent.slice(0, 3).map((r, i) => <span key={i}>{r.season} R{r.round}: {r.name} ({r.pos})</span>)}
                  </div>
                )}
                {delta != null && (
                  <div><small className="muted">This mock</small><span className={delta >= 0 ? "md-good" : "md-bad"}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)} spots vs ADP per pick</span></div>
                )}
              </div>
            );
          })()}
          <div className="md-results">
            {order
              .filter((c) => ownerOf(c) === resultsTeam)
              .map((c) => {
                const p = picks[c.key] ? byId.get(picks[c.key].id) : null;
                return (
                  <div key={c.key} className="md-res-row">
                    <span className="md-badge" style={{ "--c": p ? POS_VAR[p.pos] : "var(--muted)" }}>{p ? p.pos : `R${c.round}`}</span>
                    <span className={p ? "" : "muted"}>{p ? <button className="md-name-btn" onClick={() => openProfile(p)}>{p.name}</button> : "Empty"}</span>
                    <small className="muted">{pickLabel(c)}</small>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="md-panel">
          <div className="md-panel-head">
            <h4>DRAFT LOG</h4>
            <small className="muted">{draftedCount}/{order.length}</small>
          </div>
          <div className="md-log">
            {log.length ? (
              log.map((c) => {
                const pk = picks[c.key];
                const p = byId.get(pk.id);
                // Spots between where the player went and his ADP: positive is value, negative a reach.
                const gap = p && !pk.keeper ? c.overall - p.adp : 0;
                return (
                  <div key={c.key} className={`md-log-row${st.claimed.includes(ownerOf(c)) ? " mine" : ""}`}>
                    <span className="md-log-no">{pickLabel(c)}</span>
                    <span>
                      <small className="muted">{teamName(ownerOf(c))}{pk.keeper ? " kept" : " selected"}</small>
                      <b>
                        {p ? <button className="md-name-btn" onClick={() => openProfile(p)}>{p.name}</button> : pk.id}
                        {gap >= 3 && <em className="md-good"> value +{gap}</em>}
                        {gap <= -3 && <em className="md-bad"> reach {gap}</em>}
                      </b>
                      <small><i style={{ color: POS_VAR[p?.pos] }}>{p?.pos}</i> {p?.school}</small>
                      {pk.why?.length > 0 && <small className="md-why">Why: {pk.why.join(" · ")}</small>}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="md-welcome">
                <h3>Welcome to your mock draft!</h3>
                <p>Start by adjusting any draft settings to fit your league. Claim the team(s) you want to draft for; every other team is a CPU drafting from the {(RANKINGS.find((r) => r.key === s.rankings) || RANKINGS[0]).label.toLowerCase()} rankings.</p>
                <p>Set keepers or trade picks by clicking on the board before you start.</p>
                {league && st.sync && <p>Loaded from {league.league.name}: columns are each slot's original team and → shows who owns the pick now. The current owner makes the selection.</p>}
                {synced && s.cpuStyle === "smart" && (
                  <p>
                    {profile
                      ? `Smart CPUs draft the way each manager has in ${profile.seasons.length} seasons of this league's rookie drafts (${profile.seasons[profile.seasons.length - 1]}–${profile.seasons[0]}), weighted toward recent years, adjusted for their roster needs today. Pick a team in Results to see its read.`
                      : hist
                        ? "No past rookie drafts found for this league, so Smart CPUs use ADP and roster need only."
                        : "Reading this league's draft history…"}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="muted small" style={{ marginTop: "1rem" }}>
        Columns show each slot's original team; → means the pick was traded and shows the team that makes the selection. Pool: the graded {PROSPECT_CLASS} class (BGM Prospect Score) plus every player on the outside boards below. CONS blends them (superflex boards count fully in superflex leagues, 1QB boards in 1QB leagues); hover a CONS number to see each source. NFL is the NFL Mock Draft DB consensus big board, which also supplies the IDP pool. Click a graded player to open their report card in a new tab.
        <br />
        Boards:{" "}
        {BOARD_SOURCES.map((b, i) => (
          <span key={b.key}>
            {i > 0 && " · "}
            <a href={b.url} target="_blank" rel="noopener noreferrer">{b.label}</a> ({b.sub}{b.live ? (live?.lists?.[b.key] ? ", live" : ", snapshot") : ", snapshot"})
          </span>
        ))}
        {live?.fetched ? ` — refreshed ${new Date(live.fetched).toLocaleString()}` : " — showing the saved snapshot"}
      </p>

      {ui.settings && (
        <SettingsModal state={st} locked={locked} league={league} tab={ui.settings} setTab={(t) => setU({ settings: t })} onApply={applySettings} onClose={() => setU({ settings: null })} />
      )}
      {ui.scout && byId.get(ui.scout) && <ScoutCard p={byId.get(ui.scout)} espnId={src.espnIds[slug(byId.get(ui.scout).name)]} onClose={() => setU({ scout: null })} />}
      {ui.cell && (
        <CellModal
          cell={ui.cell}
          state={st}
          pool={pool}
          drafted={drafted}
          onSave={(patch) => saveCell(ui.cell, patch)}
          onClose={() => setU({ cell: null })}
        />
      )}
    </div>
  );
}
