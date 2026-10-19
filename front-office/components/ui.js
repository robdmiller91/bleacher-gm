"use client";

import { useEffect, useState } from "react";
import { FALLBACK_IMG, POS_VAR } from "@/lib/model";
import { useApp } from "./AppShell";

const PATHS = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  rankings: "M4 20V11M10 20V5M16 20v-6M2 20h20",
  trade: "M4 8h14l-4-4M20 16H6l4 4",
  league: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3",
  sun: "M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6L19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4L19 5M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM21 21l-5-5",
  close: "M6 6l12 12M18 6L6 18",
  chart: "M4 19h16M7 15l4-4 3 3 5-6",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z",
  target: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
  blueprint: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 18l9 5 9-5",
  lab: "M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10",
  history: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
};

export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Img({ src, className, alt = "" }) {
  return (
    <img
      src={src || FALLBACK_IMG}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(e) => {
        if (!e.currentTarget.src.endsWith("nfl.png")) e.currentTarget.src = FALLBACK_IMG;
      }}
    />
  );
}

export function Pos({ pos, rank }) {
  return (
    <span className="pos" style={{ "--c": POS_VAR[pos] || "var(--k)" }}>
      {pos}
      {rank ? ` ${rank}` : ""}
    </span>
  );
}

// A player's photo + name that opens the player view from anywhere.
export function PlayerCell({ p, sub, size }) {
  const { openPlayer } = useApp();
  if (!p) return null;
  return (
    <button className="plink pcell" onClick={() => openPlayer(p.id)} title={`Open ${p.name}`}>
      <Img src={p.img} className="headshot" alt={p.name} />
      <span style={{ minWidth: 0 }}>
        <span className="pname" style={{ display: "block", fontSize: size }}>
          {p.name}
          {p.injury ? <span className="injury"> {p.injury.slice(0, 3).toUpperCase()}</span> : null}
        </span>
        <span className="asset-meta">
          <Pos pos={p.pos} rank={p.posRank} />
          <span className="muted small">{sub ?? p.team}</span>
        </span>
      </span>
    </button>
  );
}

export function Trend({ value }) {
  if (!value) return <span className="muted">–</span>;
  return <span className={value > 0 ? "up" : "down"}>{value > 0 ? "▲" : "▼"} {Math.abs(value).toLocaleString()}</span>;
}

export function PageHead({ title, accent, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>
          {title} {accent ? <span>{accent}</span> : null}
        </h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {children ? <div className="page-head-right">{children}</div> : null}
    </div>
  );
}

export function TeamSelect({ value, onChange }) {
  const { data } = useApp();
  return (
    <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {data.teams.map((t) => (
        <option key={t.rosterId} value={t.rosterId}>
          {t.name}
          {t.rosterId === data.me ? " (you)" : ""}
        </option>
      ))}
    </select>
  );
}

// Terciles of a numeric list → heat class for a value (g = top, b = bottom).
export function heatScale(values) {
  const s = values.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (s.length < 3) return () => "m";
  const lo = s[Math.floor(s.length / 3)];
  const hi = s[Math.floor((s.length * 2) / 3)];
  return (v, invert = false) => {
    if (v == null) return "m";
    const cls = v >= hi ? "g" : v <= lo ? "b" : "m";
    if (!invert || cls === "m") return cls;
    return cls === "g" ? "b" : "g";
  };
}

// Players you've marked as untouchable, saved per team in this browser.
export function useCornerstones(rosterId) {
  const key = `cornerstones:${rosterId}`;
  const [ids, setIds] = useState([]);
  useEffect(() => {
    try {
      setIds(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      setIds([]);
    }
  }, [key]);
  const toggle = (id) =>
    setIds((list) => {
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  return [ids, toggle];
}
