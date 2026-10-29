"use client";

import { useEffect, useRef, useState } from "react";
import { HeadToHead, Monogram, OutcomeBadge, TierBadge } from "./prospects";
import { PROSPECT_CLASS, closestProfiles } from "@/lib/prospects";
import { findPlayers, rankPlayers } from "@/lib/prospectQuery";
import { leagueSummaryText } from "@/lib/leagueQuery";
import { fmt } from "@/lib/model";
import { Img, Pos } from "./ui";

// ---------------------------------------------------------------------------
// Cards shown under an answer: a head-to-head, a comp list or a single player
// ---------------------------------------------------------------------------

function CompCard({ x, target, everyone, onOpen }) {
  const pool = everyone.filter((y) => (target === "past" ? y.draftYear !== PROSPECT_CLASS && y.draftYear !== x.draftYear : y.draftYear === target));
  const comps = closestProfiles(x, pool, 6);
  return (
    <div className="px-chat-card">
      <div className="px-chat-card-head">
        {target === "past" ? `Past ${x.pos}s most like ${x.name}, and how they turned out` : `${target} ${x.pos}s most like ${x.name}`}
      </div>
      {comps.length === 0 && <div className="muted small">No players with enough data to compare.</div>}
      {comps.map(({ y, d }) => (
        <button key={y.id} className="px-chat-row" onClick={() => onOpen(y.id)}>
          <Monogram x={y} size={32} />
          <span className="px-chat-row-name">
            <b>{y.name}</b>
            <span className="muted small">{y.school} · {y.draftYear} · distance {d.toFixed(2)}</span>
          </span>
          {y.pick != null ? <OutcomeBadge x={y} /> : <TierBadge tier={y.tier} small />}
          <b className="px-num">{y.overall.toFixed(1)}</b>
        </button>
      ))}
    </div>
  );
}

function PlayerCard({ x, onOpen }) {
  return (
    <button className="px-chat-card px-chat-player" onClick={() => onOpen(x.id)} style={{ "--t": x.tier.color }}>
      <Monogram x={x} size={44} />
      <span className="px-chat-row-name">
        <b>{x.name}</b>
        <span className="muted small">{x.pos}{x.posRank} · {x.school} · {x.draftYear} · {x.archetype}</span>
      </span>
      <TierBadge tier={x.tier} small />
      <span className="px-chat-kv"><small>Grade</small><b>{x.grade.toFixed(2)}</b></span>
      <span className="px-chat-kv"><small>Overall</small><b>{x.overall.toFixed(1)}</b></span>
      {x.pick != null && <OutcomeBadge x={x} />}
    </button>
  );
}

// An NFL player from the connected league: dynasty value, rank, age and production.
function LeaguePlayerCard({ p, owner, onOpen }) {
  return (
    <button className="px-chat-card px-chat-player" onClick={() => onOpen?.(p.id)} style={{ "--t": "var(--accent)" }}>
      <Img src={p.img} className="avatar" />
      <span className="px-chat-row-name">
        <b>{p.name}</b>
        <span className="muted small">{p.team || "FA"} · {p.age ? `age ${Math.floor(p.age)}` : "age —"} · {owner}</span>
      </span>
      <Pos pos={p.pos} rank={p.posRank} />
      <span className="px-chat-kv"><small>Value</small><b>{fmt(p.value)}</b></span>
      <span className="px-chat-kv"><small>PPG</small><b>{p.ppg != null ? p.ppg.toFixed(1) : "—"}</b></span>
      <span className="px-chat-kv"><small>30 days</small><b>{p.trend ? `${p.trend > 0 ? "+" : ""}${fmt(p.trend)}` : "0"}</b></span>
    </button>
  );
}

function Widget({ w, everyone, tierHits, onOpen, leagueData, onOpenLeague }) {
  const byId = (id) => everyone.find((x) => x.id === id);
  if (w.type === "league") {
    const p = leagueData?.players[w.id];
    if (!p) return null;
    const team = leagueData.teams.find((t) => t.rosterId === p.owner);
    const owner = !p.owner ? "Free agent" : p.owner === leagueData.me ? "Your team" : team?.name || "Rostered";
    return <LeaguePlayerCard p={p} owner={owner} onOpen={onOpenLeague} />;
  }
  if (w.type === "compare") {
    const x = byId(w.a);
    const y = byId(w.b);
    return x && y ? <div className="px-chat-h2h"><HeadToHead x={x} y={y} tierHits={tierHits} /></div> : null;
  }
  if (w.type === "comps") {
    const x = byId(w.of);
    return x ? <CompCard x={x} target={w.target} everyone={everyone} onOpen={onOpen} /> : null;
  }
  if (w.type === "player") {
    const x = byId(w.id);
    return x ? <PlayerCard x={x} onOpen={onOpen} /> : null;
  }
  return null;
}

// Answers link prospects as [Name](#p:ID) and league players as [Name](#l:ID); render those as buttons,
// plus **bold** and "- " lists.
function RichText({ text, onOpen, onOpenLeague }) {
  const inline = (line, key) => {
    const parts = [];
    const re = /\[([^\]]+)\]\(#([pl]):([^)]+)\)|\*\*([^*]+)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[1]) {
        const open = m[2] === "l" ? onOpenLeague : onOpen;
        parts.push(<button key={`${key}-${m.index}`} className="px-plink" onClick={() => open?.(m[3])}>{m[1]}</button>);
      } else parts.push(<b key={`${key}-${m.index}`}>{m[4]}</b>);
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts;
  };
  return (
    <div className="px-answer">
      {text.split("\n").map((l, i) => {
        if (/^\s*[-*] /.test(l)) return <div key={i} className="px-li">{inline(l.replace(/^\s*[-*] /, ""), i)}</div>;
        if (/^#+ /.test(l)) return <b key={i} className="px-h">{inline(l.replace(/^#+ /, ""), i)}</b>;
        if (!l.trim()) return <div key={i} className="px-gap" />;
        return <p key={i}>{inline(l, i)}</p>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Built-in answers for when the AI assistant isn't switched on
// ---------------------------------------------------------------------------

const link = (x) => `[${x.name}](#p:${x.id})`;

const leagueLink = (p) => `[${p.name}](#l:${p.id})`;
const normName = (s) => (s || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
const clean = (s) => s.replace(/[?.!]+$/, "").replace(/^(the|a)\s+/i, "").trim();

// NFL players in the connected league (rostered or free agents), exact name first, then every word, by value.
function findLeaguePlayer(leagueData, s) {
  if (!leagueData) return null;
  const q = normName(s);
  const words = s.toLowerCase().split(/\s+/).map(normName).filter(Boolean);
  if (!q) return null;
  const pool = Object.values(leagueData.players).filter((p) => p.pos !== "DEF");
  return (
    pool.find((p) => normName(p.name) === q) ||
    pool.filter((p) => words.every((w) => normName(p.name).includes(w))).sort((a, b) => b.value - a.value)[0] ||
    null
  );
}

// A name can be a prospect (graded) or an NFL player in the league (valued); exact matches win.
function resolve(s, everyone, leagueData) {
  const name = clean(s);
  const pr = findPlayers(everyone, name, { limit: 1 })[0] || null;
  const lp = findLeaguePlayer(leagueData, name);
  const exact = (n) => n && normName(n) === normName(name);
  return { pr: pr && (exact(pr.name) || !exact(lp?.name)) ? pr : null, lp };
}

function compareAnswer(a, b, leagueData) {
  if (a.pr && b.pr) {
    const lead = a.pr.grade >= b.pr.grade ? [a.pr, b.pr] : [b.pr, a.pr];
    return {
      text: `${link(lead[0])} grades higher (${lead[0].grade.toFixed(2)} vs ${lead[1].grade.toFixed(2)}, ${lead[0].tier.label} vs ${lead[1].tier.label}). Head to head below.`,
      widgets: [{ type: "compare", a: a.pr.id, b: b.pr.id }],
    };
  }
  if (a.lp && b.lp) {
    const lead = a.lp.value >= b.lp.value ? [a.lp, b.lp] : [b.lp, a.lp];
    const ppg = (p) => (p.ppg != null ? `${p.ppg.toFixed(1)} ppg` : "no games yet");
    return {
      text: `${leagueLink(lead[0])} has the higher dynasty value (${fmt(lead[0].value)} vs ${fmt(lead[1].value)}).\n- ${leagueLink(lead[0])}: ${lead[0].pos}${lead[0].posRank || ""}, age ${lead[0].age ? Math.floor(lead[0].age) : "—"}, ${ppg(lead[0])}\n- ${leagueLink(lead[1])}: ${lead[1].pos}${lead[1].posRank || ""}, age ${lead[1].age ? Math.floor(lead[1].age) : "—"}, ${ppg(lead[1])}`,
      widgets: [{ type: "league", id: a.lp.id }, { type: "league", id: b.lp.id }],
    };
  }
  // One NFL player and one prospect: different measuring sticks, so show both side by side.
  const side = (r) => (r.pr ? { text: `${link(r.pr)} is a ${r.pr.draftYear} prospect (${r.pr.tier.label}, grade ${r.pr.grade.toFixed(2)}, overall ${r.pr.overall.toFixed(1)})`, w: { type: "player", id: r.pr.id } } : { text: `${leagueLink(r.lp)} is an NFL ${r.lp.pos}${r.lp.posRank || ""} (dynasty value ${fmt(r.lp.value)}, age ${r.lp.age ? Math.floor(r.lp.age) : "—"})`, w: { type: "league", id: r.lp.id } });
  const [x, y] = [side(a), side(b)];
  return {
    text: `${x.text}; ${y.text}. A prospect's grade and an NFL player's dynasty value aren't on the same scale, so here they are side by side. For a judgment call between them, copy the question to Claude.`,
    widgets: [x.w, y.w],
    handoff: true,
  };
}

function localAnswer(question, everyone, leagueData) {
  const find = (s) => findPlayers(everyone, clean(s), { limit: 1 })[0];
  let m = question.match(/compare\s+(.+?)\s+(?:and|vs\.?|versus|with|to)\s+(.+)/i) || question.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+)/i);
  if (m) {
    const a = resolve(m[1], everyone, leagueData);
    const b = resolve(m[2], everyone, leagueData);
    if ((a.pr || a.lp) && (b.pr || b.lp)) return compareAnswer(a, b, leagueData);
  }
  m = question.match(/(?:like|similar to|comps? (?:for|to|of)|resembles?|compar(?:able|isons?) to|profiles? like)\s+(.+)/i);
  if (m) {
    const a = find(m[1]);
    if (a) {
      const widgets = [{ type: "comps", of: a.id, target: PROSPECT_CLASS }];
      if (a.draftYear === PROSPECT_CLASS || /past|history|histor|turned out|nfl/i.test(question)) widgets.push({ type: "comps", of: a.id, target: "past" });
      return { text: `Closest grade profiles to ${link(a)}:`, widgets };
    }
  }
  m = question.match(/\b(qb|rb|wr|te)s?\b/i);
  if (m && /\b(top|best|rank|ranking|rankings|highest)\b/i.test(question)) {
    const pos = m[1].toUpperCase();
    const yr = question.match(/\b(20[12]\d)\b/);
    const classYear = yr ? Number(yr[1]) : /all[- ]time|ever|history/i.test(question) ? undefined : PROSPECT_CLASS;
    const n = Math.min(Number(question.match(/\b(\d{1,2})\b/)?.[1]) || 10, 25);
    const rows = rankPlayers(everyone, { pos, classYear, limit: n });
    return {
      text: `Top ${rows.length} ${pos}s${classYear ? ` in the ${classYear} class` : " since 2018"} by grade:\n${rows.map((r, i) => `- ${i + 1}. [${r.name}](#p:${r.id}) · ${r.tier} · grade ${r.grade} · ${r.class}`).join("\n")}`,
      widgets: [],
    };
  }
  const solo = resolve(question.replace(/^(who is|tell me about|show me|open)\s+/i, ""), everyone, leagueData);
  if (solo.pr) return { text: `Here's ${link(solo.pr)}:`, widgets: [{ type: "player", id: solo.pr.id }] };
  if (solo.lp) return { text: `Here's ${leagueLink(solo.lp)}:`, widgets: [{ type: "league", id: solo.lp.id }] };
  return null;
}

// ---------------------------------------------------------------------------
// The dock
// ---------------------------------------------------------------------------

const LEAGUE_SUGGESTIONS = [
  "Is it worth tanking this year to get a better pick next year?",
  "Which position group should I upgrade, and who could I trade with?",
];
const SUGGESTIONS = [
  `Which ${PROSPECT_CLASS} WRs look most like Ja'Marr Chase?`,
  "Compare Jeremiah Smith and Marvin Harrison Jr.",
  `Top 10 RBs in the ${PROSPECT_CLASS} class`,
  `Who does the model like more than the market in ${PROSPECT_CLASS}?`,
];
const SIZES = [["third", "⅓"], ["half", "½"], ["full", "Full"]];

// A chat panel docked to the bottom of every page. Closed, it's an "Ask the model" button.
// `context` carries the connected Sleeper league and user, so league questions can be answered.
// Without an API key, free-form questions are handed off to Claude: the question plus a
// league summary (`leagueData`) is copied to paste into claude.ai.
export function ChatDock({ everyone, tierHits, onOpen, onOpenLeague, context, leagueData, size, onSize }) {
  const [thread, setThread] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiOff, setAiOff] = useState(false);
  const [copied, setCopied] = useState(null);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, busy]);
  useEffect(() => {
    if (size !== "closed") inputRef.current?.focus();
  }, [size]);

  const copyForClaude = async (question, key) => {
    const text = leagueData
      ? leagueSummaryText(leagueData, { prospects: everyone, prospectClass: PROSPECT_CLASS, question })
      : question;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2500);
    } catch {
      setCopied("failed");
    }
  };

  const openFromChat = (id) => {
    onOpen(id);
    if (size === "full") onSize("third");
  };

  const ask = async (question) => {
    const text = question.trim();
    if (!text || busy) return;
    const history = thread.map((t) => ({ role: t.role, content: t.text }));
    setThread((t) => [...t, { role: "user", text }]);
    setQ("");
    setBusy(true);
    const reply = (msg) => setThread((t) => [...t, { role: "assistant", widgets: [], ...msg }]);
    try {
      if (!aiOff) {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, history, league: context?.league, user: context?.user }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.answer) return reply({ text: data.answer, widgets: data.widgets || [] });
        if (data.error !== "not_configured") return reply({ text: data.error || "Something went wrong. Try again.", error: true });
        setAiOff(true);
      }
      const local = everyone.length || leagueData ? localAnswer(text, everyone, leagueData) : null;
      if (local) reply({ ...local, handoff: local.handoff ? text : undefined });
      else reply({
        text: leagueData
          ? "That's one for Claude. Copy your question with a summary of your league (standings, playoff odds, your roster, pick values and the top prospects), then paste it into Claude."
          : "That's one for Claude. Copy your question and paste it into Claude. Here I can compare players (\"compare A and B\"), find comps (\"players like X\"), list the top players at a position, or pull up a player by name.",
        handoff: text,
      });
    } catch {
      reply({ text: "Couldn't reach the server. Try again.", error: true });
    } finally {
      setBusy(false);
    }
  };

  if (size === "closed") {
    return (
      <button className="px-dock-launch" onClick={() => onSize("third")}>
        <span className="px-dock-dot" /> Ask the model
      </button>
    );
  }

  return (
    <section className={`px-dock ${size}`} aria-label="Ask the model">
      <header className="px-dock-head">
        <span className="px-dock-dot" />
        <b>Ask the model</b>
        <span className="muted small">· your league, trades, picks, prospects, comparisons and comps</span>
        <span className="px-dock-actions">
          <span className="px-seg">
            {SIZES.map(([k, l]) => <button key={k} className={size === k ? "on" : ""} onClick={() => onSize(k)}>{l}</button>)}
          </span>
          {leagueData && (
            <button className="px-dock-btn" onClick={() => copyForClaude("", "head")} title="Copy standings, playoff odds, your roster, pick values and top prospects to paste into Claude">
              {copied === "head" ? "Copied ✓" : "Copy league summary"}
            </button>
          )}
          <button className="px-dock-btn" onClick={() => setThread([])} disabled={!thread.length}>Clear</button>
          <button className="px-dock-btn" onClick={() => onSize("closed")}>Close</button>
        </span>
      </header>
      <div className="px-dock-body" ref={bodyRef}>
        {thread.length === 0 && (
          <>
            <p className="px-dock-intro">
              Ask anything about {context?.league ? "your league (standings, rosters, trades, draft picks, strategy) or " : ""}the prospects: compare two players, find {PROSPECT_CLASS} prospects who profile like someone you know, or check how a tier has hit. Answers come only from the site's data. Try one of these:
            </p>
            <div className="px-examples">
              {[...(context?.league ? LEAGUE_SUGGESTIONS : []), ...SUGGESTIONS].map((s) => <button key={s} className="px-chip" onClick={() => ask(s)}>{s}</button>)}
            </div>
          </>
        )}
        {thread.map((t, i) => (
          <div key={i} className={`px-msg ${t.role}${t.error ? " error" : ""}`}>
            {t.role === "user" ? <p>{t.text}</p> : <RichText text={t.text} onOpen={openFromChat} onOpenLeague={onOpenLeague} />}
            {(t.widgets || []).map((w, j) => <Widget key={j} w={w} everyone={everyone} tierHits={tierHits} onOpen={openFromChat} leagueData={leagueData} onOpenLeague={onOpenLeague} />)}
            {t.handoff != null && (
              <div className="px-handoff">
                <button className="px-chip" onClick={() => copyForClaude(t.handoff, i)}>
                  {copied === i ? "Copied ✓" : leagueData ? "Copy question + league summary" : "Copy question"}
                </button>
                <a className="px-chip" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Open Claude ↗</a>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="px-msg assistant"><span className="px-typing"><i /><i /><i /></span></div>}
        {copied === "failed" && <p className="muted small" style={{ margin: 0 }}>Your browser blocked copying. Try again after clicking on the page.</p>}
      </div>
      <form
        className="px-dock-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input ref={inputRef} className="input" value={q} maxLength={1000} placeholder={context?.league ? "Ask about your league or the prospects…" : "Ask about the prospects…"} onChange={(e) => setQ(e.target.value)} disabled={busy} />
        <button className="px-send" type="submit" disabled={busy || !q.trim()}>Send</button>
      </form>
    </section>
  );
}
