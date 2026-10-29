"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "./AppShell";
import { Icon, Img, Pos, PlayerCell, Trend, heatScale } from "./ui";
import { AGE_CURVES, POS_VAR, fmt, heightLabel, ordinal, teamLogo } from "@/lib/model";
import { playerTimeline } from "@/lib/playerHistory";

// Game log column groups per position: [statKey, label, lowerIsBetter]
const RECEIVING = { group: "Receiving", cols: [["rec_tgt", "TGT"], ["rec", "REC"], ["rec_yd", "YDS"], ["ypr", "Y/R"], ["rec_td", "TD"]] };
const COLS = {
  QB: [
    { group: "Passing", cols: [["pass_att", "ATT"], ["pass_cmp", "CMP"], ["pass_yd", "YDS"], ["pass_td", "TD"], ["pass_int", "INT", true]] },
    { group: "Rushing", cols: [["rush_att", "ATT"], ["rush_yd", "YDS"], ["rush_td", "TD"]] },
  ],
  RB: [
    { group: "Rushing", cols: [["rush_att", "ATT"], ["rush_yd", "YDS"], ["ypc", "Y/A"], ["rush_td", "TD"]] },
    { group: "Receiving", cols: [["rec_tgt", "TGT"], ["rec", "REC"], ["rec_yd", "YDS"], ["rec_td", "TD"]] },
  ],
  WR: [RECEIVING, { group: "Rushing", cols: [["rush_att", "ATT"], ["rush_yd", "YDS"]] }],
  TE: [RECEIVING],
};

function statValue(w, key) {
  const s = w.stats;
  if (!s) return null;
  if (key === "ypc") return s.rush_att ? s.rush_yd / s.rush_att : null;
  if (key === "ypr") return s.rec ? s.rec_yd / s.rec : null;
  if (key === "snp") return s.tm_off_snp ? (s.off_snp / s.tm_off_snp) * 100 : null;
  return s[key] ?? 0;
}
const show = (v, key) => (v == null ? "–" : ["ypc", "ypr"].includes(key) ? v.toFixed(1) : Math.round(v));

function Meter({ label, level, word, note }) {
  const color = level >= 4 ? "var(--good)" : level <= 2 ? "var(--bad)" : "var(--pk)";
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <span style={{ color }}>{word}</span>
      </div>
      <div className="meter-segs">
        {[1, 2, 3, 4, 5].map((i) => <i key={i} style={i <= level ? { background: color } : undefined} />)}
      </div>
      <p>{note}</p>
    </div>
  );
}

function WeeklyChart({ weeks, color }) {
  const max = Math.max(10, ...weeks.map((w) => Math.max(w.pts || 0, w.proj || 0)));
  const W = 720;
  const H = 180;
  const bw = W / weeks.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 40}`} width="100%" role="img" aria-label="Fantasy points and opponent by week">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1="0" x2={W} y1={H - H * f} y2={H - H * f} stroke="var(--border)" strokeDasharray="3 4" />
      ))}
      {weeks.map((w, i) => {
        const x = i * bw + bw * 0.18;
        const width = bw * 0.64;
        const val = w.played ? w.pts : w.proj;
        const h = val ? (val / max) * H : 0;
        return (
          <g key={w.week}>
            {val ? (
              <rect
                x={x} y={H - h} width={width} height={h} rx="5"
                fill={w.played ? color : "none"} stroke={color} strokeWidth={w.played ? 0 : 1.5}
                strokeDasharray={w.played ? undefined : "4 3"}
              >
                <title>{`Week ${w.week}${w.opp ? ` vs ${w.opp}` : ""}: ${w.played ? `${val.toFixed(1)} pts` : `${val.toFixed(1)} projected`}`}</title>
              </rect>
            ) : null}
            {w.played && val ? (
              h > 18 ? (
                <text x={x + width / 2} y={H - h + 13} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{Math.round(val)}</text>
              ) : (
                <text x={x + width / 2} y={H - h - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text)">{Math.round(val)}</text>
              )
            ) : null}
            <text x={x + width / 2} y={H + 16} textAnchor="middle" fontSize="10" fill="var(--muted)">{w.week}</text>
            <text x={x + width / 2} y={H + 32} textAnchor="middle" fontSize="10" fontWeight="600" fill={w.played ? "var(--text)" : "var(--muted)"}>
              {w.bye ? "BYE" : w.opp || "–"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function timeAgo(ms) {
  if (!ms) return "";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

function NewsItem({ n, featured }) {
  return (
    <article className={`news${featured ? " featured" : ""}`}>
      <div className="news-meta">
        <span className={`news-src ${n.sourceKey}`}>{n.source}</span>
        <span className="muted small">{timeAgo(n.published)}</span>
      </div>
      <h4>{n.title}</h4>
      {n.url && (
        <a className="news-link" href={n.url} target="_blank" rel="noopener noreferrer">
          Read on {n.source} ↗
        </a>
      )}
    </article>
  );
}

function NewsFeed({ items }) {
  const [src, setSrc] = useState("all");
  if (items === null) return <div className="skeleton" style={{ height: 300 }} />;
  if (!items.length) return <div className="empty">No recent news for this player.</div>;
  const sources = [...new Set(items.map((n) => n.source))];
  const shown = src === "all" ? items : items.filter((n) => n.source === src);
  return (
    <div className="grid" style={{ gap: "0.8rem" }}>
      <div className="card-title" style={{ marginBottom: 0 }}>
        <h3>Player News</h3>
        <div className="seg">
          {["all", ...sources].map((s) => (
            <button key={s} className={src === s ? "on" : ""} onClick={() => setSrc(s)}>{s === "all" ? "All" : s}</button>
          ))}
        </div>
      </div>
      {shown.map((n, i) => <NewsItem key={n.id} n={n} featured={i === 0} />)}
      <p className="muted small" style={{ margin: 0 }}>Headlines from FantasyPros, RotoWire and RotoBaller, as listed in the Sleeper app. Read the full story on the publisher's site.</p>
    </div>
  );
}

// League history is the same for every player, so fetch it once per league and share it.
const historyCache = {};
const leagueHistory = (q) =>
  (historyCache[q] ??= fetch(`/api/history?${q}`)
    .then((r) => r.json())
    .catch((e) => ({ error: String(e) }))
    .then((d) => {
      if (d.error) delete historyCache[q];
      return d;
    }));

const TX_LABEL = { drafted: "Drafted", traded: "Traded", claimed: "Claimed", added: "Added", dropped: "Dropped", moved: "Commish" };

function TxDate({ e }) {
  return (
    <span className="muted small tx-date">
      {e.date ? new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }) : e.season}
      {e.week != null && e.kind !== "drafted" ? <><br />{e.week === 0 ? "Offseason" : `Week ${e.week}`}</> : null}
    </span>
  );
}

function Transactions({ events, playerName }) {
  const { data, openPlayer } = useApp();
  const item = (a, sign) => (
    <li key={(a.id || a.label) + sign}>
      <span className={sign === "+" ? "tx-plus" : "tx-minus"}>{sign === "+" ? "+" : "−"}</span>
      {a.id && data.players[a.id] ? <button className="plink" onClick={() => openPlayer(a.id)}>{a.label}</button> : a.label}
    </li>
  );
  if (!events.length) return <div className="empty">No transactions for {playerName} in this league's history.</div>;
  return (
    <div className="tx-list">
      {events.map((e) => (
        <div key={e.key} className={`tx tx-${e.kind}`}>
          <span className="tx-kind">{TX_LABEL[e.kind]}</span>
          <div className="tx-body">
            {e.kind === "drafted" && <div className="tx-title">by <b>{e.team}</b> with pick {e.pick} <span className="muted small">· {e.draft}</span></div>}
            {e.kind === "traded" && (
              <>
                <div className="tx-title">to <b>{e.team}</b> from <b>{e.from}</b></div>
                <div className="tx-sides">
                  <ul>{e.got.map((a) => item(a, "+"))}</ul>
                  <ul>{e.gave.map((a) => item(a, "-"))}</ul>
                </div>
              </>
            )}
            {(e.kind === "claimed" || e.kind === "added" || (e.kind === "moved" && !e.released)) && (
              <>
                <div className="tx-title">
                  {e.kind === "claimed" ? "off waivers by" : e.kind === "added" ? "as a free agent by" : "to"} <b>{e.team}</b>
                  {e.bid ? <span className="muted small"> · ${e.bid} FAAB</span> : null}
                </div>
                {e.dropped?.length > 0 && <ul>{e.dropped.map((pid) => item({ id: pid, label: data.players[pid]?.name || "Player" }, "-"))}</ul>}
              </>
            )}
            {e.released && <div className="tx-title">{e.kind === "moved" ? "removed from" : "by"} <b>{e.team}</b></div>}
          </div>
          <TxDate e={e} />
        </div>
      ))}
    </div>
  );
}

export default function PlayerModal({ id, onClose }) {
  const { data, live, openPlayer, leagueQuery } = useApp();
  const p = data.players[id];
  const [tab, setTab] = useState("overview");
  const [season, setSeason] = useState(data.league.season);
  const [logs, setLogs] = useState(null);
  const [news, setNews] = useState(null);
  const [hist, setHist] = useState(null);

  useEffect(() => {
    if (!leagueQuery) return;
    let alive = true;
    leagueHistory(leagueQuery).then((d) => alive && setHist(d));
    return () => {
      alive = false;
    };
  }, [leagueQuery]);
  const timeline = useMemo(() => (hist && !hist.error ? playerTimeline(hist, id) : []), [hist, id]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/news/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => alive && setNews(d.items || []))
      .catch(() => alive && setNews([]));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    let alive = true;
    setLogs(null);
    fetch(`/api/player/${encodeURIComponent(id)}?${leagueQuery}&season=${season}`)
      .then((r) => r.json())
      .then((d) => alive && setLogs(d))
      .catch(() => alive && setLogs({ error: true }));
    return () => {
      alive = false;
    };
  }, [id, season, leagueQuery]);

  const ownerTeam = data.teams.find((t) => t.rosterId === p?.owner);
  const color = POS_VAR[p?.pos] || "var(--k)";

  const related = useMemo(() => {
    if (!p) return [];
    const all = Object.values(data.players);
    const list = p.owner
      ? all.filter((x) => x.owner === p.owner)
      : all.filter((x) => !x.owner && x.pos === p.pos);
    return list.sort((a, b) => b.value - a.value).slice(0, 14);
  }, [data, p]);

  const similar = useMemo(() => {
    if (!p) return [];
    return Object.values(data.players)
      .filter((x) => x.pos === p.pos && x.id !== p.id && x.value > 0)
      .sort((a, b) => Math.abs(a.value - p.value) - Math.abs(b.value - p.value))
      .slice(0, 6)
      .sort((a, b) => b.value - a.value);
  }, [data, p]);

  const leagueRank = useMemo(() => {
    if (!p) return null;
    const pool = Object.values(data.players).filter((x) => x.owner && x.pos === p.pos && x.value > 0);
    const better = pool.filter((x) => x.value > p.value).length;
    return { rank: better + 1, of: pool.length + (p.owner ? 0 : 1) };
  }, [data, p]);

  const production = useMemo(() => {
    if (!p || p.ppg == null) return null;
    const pool = Object.values(data.players).filter((x) => x.pos === p.pos && x.ppg != null && x.gp >= 2);
    const better = pool.filter((x) => x.ppg > p.ppg).length;
    return { rank: better + 1, of: pool.length };
  }, [data, p]);

  if (!p) return null;

  const weeks = logs?.weeks || [];
  const played = weeks.filter((w) => w.played);
  const last3 = played.slice(-3);
  const last3Avg = last3.length ? last3.reduce((s, w) => s + (w.pts || 0), 0) / last3.length : null;
  const weekProj = live?.projections?.[id];

  // ---- Computed "sentiment" meters (from FantasyCalc + Sleeper stats) ----
  const trendPct = p.value ? p.trend / p.value : 0;
  const momentum = trendPct > 0.05 ? 5 : trendPct > 0.015 ? 4 : trendPct > -0.015 ? 3 : trendPct > -0.05 ? 2 : 1;
  const momentumWord = momentum >= 4 ? "Rising" : momentum === 3 ? "Steady" : "Falling";
  const prodLevel = production ? Math.max(1, Math.ceil((1 - (production.rank - 1) / Math.max(production.of, 1)) * 5)) : 0;
  const curve = AGE_CURVES[p.pos];
  let ageLevel = 3;
  let ageWord = "—";
  if (curve && p.age) {
    if (p.age < curve.peak - 1) [ageLevel, ageWord] = [5, "Ascending"];
    else if (p.age <= curve.peak + 1) [ageLevel, ageWord] = [4, "Peak"];
    else if (p.age < curve.decline) [ageLevel, ageWord] = [3, "Prime"];
    else if (p.age < curve.decline + 2) [ageLevel, ageWord] = [2, "Declining"];
    else [ageLevel, ageWord] = [1, "Late career"];
  }

  const tradeHref = !p.owner ? null : p.owner === data.me ? `/trade?give=${p.id}` : `/trade?get=${p.id}&partner=${p.owner}`;
  const groups = COLS[p.pos] || [];
  const fptsHeat = heatScale(played.map((w) => w.pts));
  const snapHeat = heatScale(played.map((w) => statValue(w, "snp")));
  const colHeat = {};
  for (const g of groups) for (const [key] of g.cols) colHeat[key] = heatScale(played.map((w) => statValue(w, key)));

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <aside className="modal-side">
          <h4>{ownerTeam ? `On ${ownerTeam.name}` : `Top free agent ${p.pos}s`}</h4>
          {related.map((x) => (
            <button key={x.id} className={`side-player${x.id === p.id ? " on" : ""}`} onClick={() => openPlayer(x.id)}>
              <Img src={x.img} className="avatar" />
              <span style={{ minWidth: 0 }}>
                <span className="pname" style={{ display: "block", fontSize: "0.82rem" }}>{x.name}</span>
                <span className="muted small">{x.pos}{x.posRank || ""} · {x.team}</span>
              </span>
            </button>
          ))}
        </aside>

        <div className="modal-main">
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>

          <div className="hero" style={{ "--c": color }}>
            <img className="hero-logo" src={teamLogo(p.team)} alt="" />
            <Img src={p.img} className="hero-photo" alt={p.name} />
            <div className="hero-info">
              <span className="hero-owner">{ownerTeam ? ownerTeam.name : "Free agent"}{p.status && p.owner ? ` · ${p.status}` : ""}</span>
              <h2>{p.name}</h2>
              <div className="hero-sub">
                <span>{p.pos} – {p.team}</span>
                {p.age ? <span>Age {Math.floor(p.age)}</span> : null}
                {p.number != null ? <span>#{p.number}</span> : null}
                {p.injury ? <span style={{ color: "#fca5a5" }}>{p.injury}{p.injuryPart ? ` (${p.injuryPart})` : ""}</span> : null}
              </div>
              <div className="hero-stats">
                <div><small>Dynasty Value</small><b>{fmt(p.value)}</b></div>
                <div><small>Pos Rank</small><b>{p.posRank ? `${p.pos}${p.posRank}` : "—"}</b></div>
                <div><small>Overall</small><b>{p.ovrRank ? `#${p.ovrRank}` : "—"}</b></div>
                <div><small>30-Day</small><b>{p.trend > 0 ? "+" : ""}{fmt(p.trend)}</b></div>
                <div><small>PPG</small><b>{p.ppg != null ? p.ppg.toFixed(1) : "—"}</b></div>
                <div><small>Wk {live?.week ?? ""} Proj</small><b>{weekProj != null ? weekProj.toFixed(1) : "—"}</b></div>
              </div>
              <div className="hero-actions">
                {tradeHref && (
                  <Link className="btn primary" href={tradeHref} onClick={onClose}>
                    <Icon name="trade" size={16} /> {p.owner === data.me ? "Shop in trade calculator" : "Build a trade for him"}
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="tabs">
            {[["overview", "Overview"], ["news", `News${news?.length ? ` (${news.length})` : ""}`], ["logs", "Game Logs"], ["moves", `Transactions${timeline.length ? ` (${timeline.length})` : ""}`], ["league", "League Context"]].map(([k, l]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          <div className="modal-body">
            {tab === "news" && <NewsFeed items={news} />}

            {tab === "moves" && (
              <div>
                <div className="card-title">
                  <h3>Transaction History</h3>
                  <span className="muted small">Every season of this league on Sleeper</span>
                </div>
                {!hist ? (
                  <div className="skeleton" style={{ height: 220 }} />
                ) : hist.error ? (
                  <div className="empty">Couldn't load league history: {hist.error}</div>
                ) : (
                  <Transactions events={timeline} playerName={p.name} />
                )}
              </div>
            )}

            {tab === "overview" && (
              <div className="grid" style={{ gap: "1.2rem" }}>
                {news === null ? (
                  <div className="skeleton" style={{ height: 140 }} />
                ) : news.length > 0 ? (
                  <div>
                    <div className="card-title" style={{ marginBottom: "0.6rem" }}>
                      <h3>Latest News</h3>
                      {news.length > 1 && <button className="link" onClick={() => setTab("news")}>All {news.length} updates →</button>}
                    </div>
                    <NewsItem n={news[0]} featured />
                  </div>
                ) : null}
                <div>
                  <div className="card-title" style={{ marginBottom: "0.6rem" }}>
                    <h3>Player Profile</h3>
                    <span className="muted small">Computed from FantasyCalc values + Sleeper stats</span>
                  </div>
                  <div className="meters">
                    <Meter label="Market" level={momentum} word={momentumWord}
                      note={`${p.trend >= 0 ? "+" : ""}${fmt(p.trend)} value over 30 days (${(trendPct * 100).toFixed(1)}%).`} />
                    <Meter label="Production" level={prodLevel} word={production ? `${ordinal(production.rank)} ${p.pos}` : "No games"}
                      note={production ? `${p.ppg.toFixed(1)} PPG under your league's scoring, ${ordinal(production.rank)} of ${production.of} ${p.pos}s with 2+ games.` : "No regular-season games yet this year."} />
                    <Meter label="Age Window" level={ageLevel} word={ageWord}
                      note={curve && p.age ? `${p.pos}s typically peak around ${curve.peak} and fade after ${curve.decline}.` : "No age curve for this position."} />
                  </div>
                </div>

                <div>
                  <div className="card-title" style={{ marginBottom: "0.4rem" }}>
                    <h3>Fantasy Points by Week</h3>
                    <span className="muted small">
                      {last3Avg != null ? `Last 3: ${last3Avg.toFixed(1)} avg · ` : ""}dashed = projection
                    </span>
                  </div>
                  {logs ? <WeeklyChart weeks={weeks} color={color} /> : <div className="skeleton" style={{ height: 180 }} />}
                </div>

                <div className="bio">
                  <div><small>College</small><b>{p.college || "—"}</b></div>
                  <div><small>Height / Weight</small><b>{heightLabel(p.height)} / {p.weight ? `${p.weight} lb` : "—"}</b></div>
                  <div><small>Experience</small><b>{p.yearsExp == null ? "—" : p.yearsExp === 0 ? "Rookie" : `${p.yearsExp} yr`}</b></div>
                  <div><small>Games played</small><b>{p.gp || 0}</b></div>
                  <div><small>Season points</small><b>{p.seasonPts != null ? fmt(p.seasonPts, 1) : "—"}</b></div>
                  <div><small>Snap share</small><b>{p.snapPct != null ? `${p.snapPct}%` : "—"}</b></div>
                </div>
              </div>
            )}

            {tab === "logs" && (
              <div>
                <div className="card-title">
                  <h3>Game Logs</h3>
                  <select className="select" value={season} onChange={(e) => setSeason(Number(e.target.value))}>
                    {[data.league.season, data.league.season - 1, data.league.season - 2].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                {!logs ? (
                  <div className="skeleton" style={{ height: 300 }} />
                ) : logs.error ? (
                  <div className="empty">Couldn't load game logs from Sleeper.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="t logs">
                      <thead>
                        <tr className="grp">
                          <th colSpan={2} />
                          <th colSpan={2}>Fantasy</th>
                          {groups.map((g) => <th key={g.group} colSpan={g.cols.length}>{g.group}</th>)}
                        </tr>
                        <tr>
                          <th>WK</th>
                          <th>OPP</th>
                          <th>FPTS</th>
                          <th>SNP%</th>
                          {groups.flatMap((g) => g.cols.map(([key, label]) => <th key={g.group + key}>{label}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.map((w) => (
                          <tr key={w.week} className={w.bye ? "bye" : ""}>
                            <td>{w.week}</td>
                            <td style={{ fontWeight: 600 }}>{w.bye ? "BYE" : w.opp || "–"}</td>
                            {w.played ? (
                              <>
                                <td><span className={`heat ${fptsHeat(w.pts)}`}>{w.pts != null ? w.pts.toFixed(1) : "–"}</span></td>
                                <td><span className={`heat ${snapHeat(statValue(w, "snp"))}`}>{show(statValue(w, "snp"), "snp")}</span></td>
                                {groups.flatMap((g) =>
                                  g.cols.map(([key, , invert]) => {
                                    const v = statValue(w, key);
                                    return (
                                      <td key={g.group + key}>
                                        <span className={`heat ${colHeat[key](v, invert)}`}>{show(v, key)}</span>
                                      </td>
                                    );
                                  }),
                                )}
                              </>
                            ) : (
                              <>
                                <td className="muted">{w.proj != null ? `${w.proj.toFixed(1)}p` : "–"}</td>
                                <td className="muted" colSpan={1 + groups.reduce((s, g) => s + g.cols.length, 0)}>
                                  {w.bye ? "" : w.proj != null ? "projected" : ""}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="muted small">
                      Points use your league's scoring settings. Green/red cells are relative to this player's own season (top and bottom third). “p” = Sleeper projection.
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === "league" && (
              <div className="grid" style={{ gap: "1.2rem" }}>
                <div className="bio">
                  <div><small>Rostered by</small><b>{ownerTeam ? ownerTeam.name : "Free agent"}</b></div>
                  <div><small>Rank among rostered {p.pos}s</small><b>{leagueRank ? `${ordinal(leagueRank.rank)} of ${leagueRank.of}` : "—"}</b></div>
                  {ownerTeam && <div><small>{ownerTeam.name}'s {p.pos} room</small><b>{ordinal(ownerTeam[`${p.pos}Rank`])} in league</b></div>}
                  {ownerTeam && <div><small>Team window</small><b>{ownerTeam.window}</b></div>}
                </div>
                <div>
                  <div className="card-title"><h3>Similar dynasty value</h3><span className="muted small">Same position, closest value — natural trade comps</span></div>
                  <table className="t">
                    <tbody>
                      {similar.map((x) => (
                        <tr key={x.id}>
                          <td><PlayerCell p={x} /></td>
                          <td className="muted">{x.owner ? data.teams.find((t) => t.rosterId === x.owner)?.name : "Free agent"}</td>
                          <td className="c"><b>{fmt(x.value)}</b></td>
                          <td className="c"><Trend value={x.trend} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
