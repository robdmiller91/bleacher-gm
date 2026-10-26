"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { HeadToHead, Monogram, OutcomeBadge, TierBadge } from "./prospects";
import { PROSPECT_CLASS, closestProfiles } from "@/lib/prospects";
import { findPlayers } from "@/lib/prospectQuery";

// Type-ahead over every graded prospect; calls onPick(id).
export function PlayerPicker({ everyone, value, onPick, placeholder = "Pick a player" }) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const picked = value ? everyone.find((x) => x.id === value) : null;
  const hits = q.trim().length < 2 ? [] : findPlayers(everyone, q, { limit: 8 });
  return (
    <div className="px-search px-picker">
      {picked && !focus ? (
        <button className="px-picked" onClick={() => setFocus(true)} style={{ "--t": picked.tier.color }}>
          <Monogram x={picked} size={36} />
          <span>
            <b>{picked.name}</b>
            <span className="muted small">{picked.pos}{picked.posRank} · {picked.school} · {picked.draftYear}</span>
          </span>
          <span className="muted small">Change</span>
        </button>
      ) : (
        <input
          autoFocus={focus}
          className="input"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
        />
      )}
      {focus && hits.length > 0 && (
        <div className="px-search-results">
          {hits.map((x) => (
            <button
              key={x.id}
              onMouseDown={() => {
                onPick(x.id);
                setQ("");
                setFocus(false);
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

export function CompareView({ everyone, tierHits, a, b, onChange, onOpen }) {
  const x = a ? everyone.find((p) => p.id === a) : null;
  const y = b ? everyone.find((p) => p.id === b) : null;
  return (
    <div className="grid">
      <div className="px-title">
        <h1><span>Compare</span> Players</h1>
        <p>Pick any two prospects, from the {PROSPECT_CLASS} class or any past class, for a head-to-head on every grade.</p>
      </div>
      <div className="px-pick-row">
        <PlayerPicker everyone={everyone} value={a} onPick={(id) => onChange(id, b)} placeholder="First player" />
        <span className="px-h2h-vs static">VS</span>
        <PlayerPicker everyone={everyone} value={b} onPick={(id) => onChange(a, id)} placeholder="Second player" />
      </div>
      {x && y ? (
        <HeadToHead x={x} y={y} tierHits={tierHits} onClose={() => onChange(null, null)} />
      ) : (
        <div className="card empty">Pick two players to compare. Different positions work, but the grades are built from different inputs.</div>
      )}
      {x && y && (
        <div className="px-filters">
          <button className="px-pill" onClick={() => onOpen(x.id)}>Open {x.name}'s report card</button>
          <button className="px-pill" onClick={() => onOpen(y.id)}>Open {y.name}'s report card</button>
        </div>
      )}
    </div>
  );
}

function CompList({ title, sub, comps, onOpen, onCompare }) {
  return (
    <div className="card px-panel">
      <div className="px-panel-head"><h3>{title}</h3><span>{sub}</span></div>
      {comps.length === 0 && <div className="empty">No players with enough data to compare.</div>}
      {comps.map(({ y, d }) => (
        <div key={y.id} className="px-comp">
          <button className="plink pcell" onClick={() => onOpen(y.id)}>
            <Monogram x={y} size={40} />
            <span>
              <span className="pname" style={{ display: "block" }}>{y.name} <span className="muted small">{y.draftYear}</span></span>
              <span className="muted small">{y.school} · {y.archetype} · similarity distance {d.toFixed(2)}</span>
            </span>
          </button>
          {y.pick != null ? <OutcomeBadge x={y} /> : <TierBadge tier={y.tier} small />}
          <b className="px-num">{y.overall.toFixed(1)}</b>
          <button className="px-vs" onClick={() => onCompare(y.id)} title={`Compare with ${y.name}`}>VS</button>
        </div>
      ))}
    </div>
  );
}

// "Who in the upcoming class looks like X?" plus how similar past prospects turned out.
export function CompsView({ everyone, of, onChange, onOpen, onCompare }) {
  const x = of ? everyone.find((p) => p.id === of) : null;
  const upcoming = useMemo(() => (x ? closestProfiles(x, everyone.filter((y) => y.draftYear === PROSPECT_CLASS), 8) : []), [x, everyone]);
  const past = useMemo(() => (x ? closestProfiles(x, everyone.filter((y) => y.draftYear !== PROSPECT_CLASS && y.draftYear !== x.draftYear), 8) : []), [x, everyone]);
  return (
    <div className="grid">
      <div className="px-title">
        <h1><span>Find</span> Comps</h1>
        <p>Pick any player, such as an NFL star from a past class, to see which {PROSPECT_CLASS} prospects have the closest grade profiles, and how similar past prospects turned out.</p>
      </div>
      <PlayerPicker everyone={everyone} value={of} onPick={onChange} placeholder="e.g. Ja'Marr Chase, Bijan Robinson, Brock Bowers" />
      {x ? (
        <div className="px-two">
          <CompList title={`${PROSPECT_CLASS} prospects like ${x.name}`} sub={`Closest ${x.pos} profiles in the upcoming class`} comps={upcoming} onOpen={onOpen} onCompare={(id) => onCompare(x.id, id)} />
          <CompList title="How similar profiles turned out" sub={`Past ${x.pos}s · NFL outcome`} comps={past} onOpen={onOpen} onCompare={(id) => onCompare(x.id, id)} />
        </div>
      ) : (
        <div className="card empty">Pick a player to find comps.</div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        Similarity compares the 0–10 input grades the two players share (dominator, breakout age, efficiency, age, size and so on) at the same position. Lower distance means more alike.
      </p>
    </div>
  );
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
  const lines = text.split("\n");
  return (
    <div className="px-answer">
      {lines.map((l, i) => {
        if (/^\s*[-*] /.test(l)) return <div key={i} className="px-li">{inline(l.replace(/^\s*[-*] /, ""), i)}</div>;
        if (/^#+ /.test(l)) return <b key={i} className="px-h">{inline(l.replace(/^#+ /, ""), i)}</b>;
        if (!l.trim()) return <div key={i} className="px-gap" />;
        return <p key={i}>{inline(l, i)}</p>;
      })}
    </div>
  );
}

const EXAMPLES = [
  `Which ${PROSPECT_CLASS} WRs look most like Ja'Marr Chase?`,
  "Compare Jeremiah Smith and Marvin Harrison Jr.",
  `Who are the best RB values in the ${PROSPECT_CLASS} class, where the model likes them more than the market?`,
  "How often do Elite Upside RBs become RB1s?",
];

// Without an API key, recognise the common question shapes and route to the matching screen.
function localAnswer(question, everyone) {
  const find = (s) => findPlayers(everyone, s.replace(/[?.!]+$/, "").trim(), { limit: 1 })[0];
  let m = question.match(/compare\s+(.+?)\s+(?:and|vs\.?|versus|with|to)\s+(.+)/i);
  if (m) {
    const a = find(m[1]);
    const b = find(m[2]);
    if (a && b) return { go: { view: "compare", a: a.id, b: b.id }, text: `Opening a head-to-head of [${a.name}](#p:${a.id}) and [${b.name}](#p:${b.id}).` };
  }
  m = question.match(/(?:like|similar to|comps? (?:for|to|of)|resembles?|compar(?:able|isons?) to)\s+(.+)/i);
  if (m) {
    const a = find(m[1]);
    if (a) return { go: { view: "comps", of: a.id }, text: `Opening comps for [${a.name}](#p:${a.id}).` };
  }
  m = question.match(/\b(qb|rb|wr|te)s?\b/i);
  if (m && /\b(top|best|rank|ranking|rankings)\b/i.test(question)) {
    return { go: { view: "rankings", pos: m[1].toUpperCase() }, text: `Opening the ${m[1].toUpperCase()} rankings.` };
  }
  const solo = find(question);
  if (solo && question.trim().split(/\s+/).length <= 4) return { go: { open: solo.id }, text: `Opening [${solo.name}](#p:${solo.id})'s report card.` };
  return null;
}

// The thread can be held by the parent so it survives opening a report card and coming back.
export function AskView({ everyone, onOpen, onGo, thread: heldThread, setThread: setHeldThread }) {
  const [localThread, setLocalThread] = useState([]);
  const thread = heldThread ?? localThread;
  const setThread = setHeldThread ?? setLocalThread;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiOff, setAiOff] = useState(false);
  const endRef = useRef(null);

  const ask = async (question) => {
    const text = question.trim();
    if (!text || busy) return;
    const history = thread.map((t) => ({ role: t.role, content: t.text }));
    setThread((t) => [...t, { role: "user", text }]);
    setQ("");
    setBusy(true);
    const reply = (msg) => {
      setThread((t) => [...t, { role: "assistant", ...msg }]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 30);
    };
    try {
      if (!aiOff) {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, history }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.answer) return reply({ text: data.answer });
        if (data.error !== "not_configured") return reply({ text: data.error || "Something went wrong. Try again.", error: true });
        setAiOff(true);
      }
      const local = localAnswer(text, everyone);
      if (local) reply({ text: local.text, go: local.go });
      else reply({ text: "Free-form answers need the AI assistant switched on (see the note below). Without it I can handle: \"compare A and B\", \"players like X\", \"top WRs\", or a player's name.", error: true });
    } catch {
      reply({ text: "Couldn't reach the server. Try again.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid">
      <div className="px-title">
        <h1><span>Ask</span> the Model</h1>
        <p>Ask about any prospect, compare players, or find {PROSPECT_CLASS} prospects who profile like a player you know. Answers come from the BGM Prospect Score data.</p>
      </div>
      <div className="card px-chat">
        {thread.length === 0 && (
          <div className="px-examples">
            {EXAMPLES.map((e) => <button key={e} className="px-pill" onClick={() => ask(e)}>{e}</button>)}
          </div>
        )}
        {thread.map((t, i) => (
          <Fragment key={i}>
            <div className={`px-msg ${t.role}${t.error ? " error" : ""}`}>
              {t.role === "user" ? <p>{t.text}</p> : <RichText text={t.text} onOpen={onOpen} />}
              {t.go && <button className="px-pill hot" onClick={() => onGo(t.go)}>Open</button>}
            </div>
          </Fragment>
        ))}
        {busy && <div className="px-msg assistant"><span className="px-typing"><i /><i /><i /></span></div>}
        <div ref={endRef} />
        <form
          className="px-ask"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <input className="input" value={q} maxLength={1000} placeholder="Ask a question about the prospects…" onChange={(e) => setQ(e.target.value)} disabled={busy} />
          <button className="px-pill hot" type="submit" disabled={busy || !q.trim()}>Ask</button>
        </form>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {aiOff
          ? "The AI assistant isn't switched on for this site (no ANTHROPIC_API_KEY), so only the shortcuts above work. Compare and Comps work fully without it."
          : "Answers are generated by Claude using the prospect data, and can be wrong. Check the report cards for the numbers."}
      </p>
    </div>
  );
}
