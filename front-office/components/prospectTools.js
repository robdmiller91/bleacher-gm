"use client";

import { useEffect, useRef, useState } from "react";
import { HeadToHead, Monogram, OutcomeBadge, TierBadge } from "./prospects";
import { PROSPECT_CLASS, closestProfiles } from "@/lib/prospects";
import { findPlayers, rankPlayers } from "@/lib/prospectQuery";

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

function Widget({ w, everyone, tierHits, onOpen }) {
  const byId = (id) => everyone.find((x) => x.id === id);
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

// Answers can link players as [Name](#p:ID); render those as buttons, plus **bold** and "- " lists.
function RichText({ text, onOpen }) {
  const inline = (line, key) => {
    const parts = [];
    const re = /\[([^\]]+)\]\(#p:([^)]+)\)|\*\*([^*]+)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[1]) parts.push(<button key={`${key}-${m.index}`} className="px-plink" onClick={() => onOpen(m[2])}>{m[1]}</button>);
      else parts.push(<b key={`${key}-${m.index}`}>{m[3]}</b>);
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

function localAnswer(question, everyone) {
  const find = (s) => findPlayers(everyone, s.replace(/[?.!]+$/, "").replace(/^(the|a)\s+/i, "").trim(), { limit: 1 })[0];
  let m = question.match(/compare\s+(.+?)\s+(?:and|vs\.?|versus|with|to)\s+(.+)/i) || question.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+)/i);
  if (m) {
    const a = find(m[1]);
    const b = find(m[2]);
    if (a && b) {
      const lead = a.grade >= b.grade ? [a, b] : [b, a];
      return {
        text: `${link(lead[0])} grades higher (${lead[0].grade.toFixed(2)} vs ${lead[1].grade.toFixed(2)}, ${lead[0].tier.label} vs ${lead[1].tier.label}). Head to head below.`,
        widgets: [{ type: "compare", a: a.id, b: b.id }],
      };
    }
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
  const solo = find(question.replace(/^(who is|tell me about|show me|open)\s+/i, ""));
  if (solo) return { text: `Here's ${link(solo)}:`, widgets: [{ type: "player", id: solo.id }] };
  return null;
}

// ---------------------------------------------------------------------------
// The dock
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  `Which ${PROSPECT_CLASS} WRs look most like Ja'Marr Chase?`,
  "Compare Jeremiah Smith and Marvin Harrison Jr.",
  `Top 10 RBs in the ${PROSPECT_CLASS} class`,
  `Who does the model like more than the market in ${PROSPECT_CLASS}?`,
];
const SIZES = [["third", "⅓"], ["half", "½"], ["full", "Full"]];

// A chat panel docked to the bottom of the prospect pages. Closed, it's an "Ask" button.
export function ChatDock({ everyone, tierHits, onOpen, size, onSize }) {
  const [thread, setThread] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiOff, setAiOff] = useState(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, busy]);
  useEffect(() => {
    if (size !== "closed") inputRef.current?.focus();
  }, [size]);

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
          body: JSON.stringify({ question: text, history }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.answer) return reply({ text: data.answer, widgets: data.widgets || [] });
        if (data.error !== "not_configured") return reply({ text: data.error || "Something went wrong. Try again.", error: true });
        setAiOff(true);
      }
      const local = localAnswer(text, everyone);
      if (local) reply(local);
      else reply({ text: "I can't answer free-form questions until the AI assistant is switched on (see the note below). Right now I can compare players (\"compare A and B\"), find comps (\"players like X\"), list the top players at a position, or pull up a player by name.", error: true });
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
        <span className="muted small">· questions, comparisons and comps, from the BGM Prospect Score data{aiOff ? "" : ", via Claude"}</span>
        <span className="px-dock-actions">
          <span className="px-seg">
            {SIZES.map(([k, l]) => <button key={k} className={size === k ? "on" : ""} onClick={() => onSize(k)}>{l}</button>)}
          </span>
          <button className="px-dock-btn" onClick={() => setThread([])} disabled={!thread.length}>Clear</button>
          <button className="px-dock-btn" onClick={() => onSize("closed")}>Close</button>
        </span>
      </header>
      <div className="px-dock-body" ref={bodyRef}>
        {thread.length === 0 && (
          <>
            <p className="px-dock-intro">Ask anything about the prospects: compare two players, find {PROSPECT_CLASS} prospects who profile like someone you know, or check how a tier has hit. Answers come only from the site's data. Try one of these:</p>
            <div className="px-examples">
              {SUGGESTIONS.map((s) => <button key={s} className="px-chip" onClick={() => ask(s)}>{s}</button>)}
            </div>
          </>
        )}
        {thread.map((t, i) => (
          <div key={i} className={`px-msg ${t.role}${t.error ? " error" : ""}`}>
            {t.role === "user" ? <p>{t.text}</p> : <RichText text={t.text} onOpen={openFromChat} />}
            {(t.widgets || []).map((w, j) => <Widget key={j} w={w} everyone={everyone} tierHits={tierHits} onOpen={openFromChat} />)}
          </div>
        ))}
        {busy && <div className="px-msg assistant"><span className="px-typing"><i /><i /><i /></span></div>}
        {aiOff && thread.length > 0 && (
          <p className="muted small" style={{ margin: 0 }}>The AI assistant isn't switched on (no ANTHROPIC_API_KEY), so free-form questions aren't answered yet. Comparisons, comps, top-N lists and player lookups still work.</p>
        )}
      </div>
      <form
        className="px-dock-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input ref={inputRef} className="input" value={q} maxLength={1000} placeholder="Ask about the prospects…" onChange={(e) => setQ(e.target.value)} disabled={busy} />
        <button className="px-send" type="submit" disabled={busy || !q.trim()}>Send</button>
      </form>
    </section>
  );
}
