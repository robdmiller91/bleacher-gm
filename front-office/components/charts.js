"use client";

import { fmt, gradeColor } from "@/lib/model";

// Multi-year dynasty value lines (Now, +1, +2, +3 years).
export function TrajectoryChart({ series, labels = ["Now", "+1 yr", "+2 yrs", "+3 yrs"], height = 200 }) {
  const W = 560;
  const H = height;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 1) * 1.08;
  const min = Math.min(...all) * 0.85;
  const x = (i) => 40 + (i / (labels.length - 1)) * (W - 70);
  const y = (v) => H - 10 - ((v - min) / (max - min || 1)) * (H - 30);
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%">
      {[0, 0.5, 1].map((f) => {
        const v = min + (max - min) * f;
        return (
          <g key={f}>
            <line x1="40" x2={W - 30} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray="3 4" />
            <text x="34" y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{fmt(v / 1000, 0)}k</text>
          </g>
        );
      })}
      {series.map((s) => (
        <g key={s.name}>
          <path
            d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}
            fill="none" stroke={s.color} strokeWidth="3" strokeDasharray={s.dashed ? "6 5" : undefined}
          />
          {s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r="4.5" fill={s.color}>
              <title>{`${s.name} · ${labels[i]}: ${fmt(v)}`}</title>
            </circle>
          ))}
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={l} x={x(i)} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">{l}</text>
      ))}
    </svg>
  );
}

export function Legend({ items }) {
  return (
    <span className="small" style={{ display: "inline-flex", gap: "0.8rem" }}>
      {items.map((s) => (
        <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <i style={{ width: 14, height: 3, borderRadius: 2, background: s.color, display: "inline-block" }} />
          {s.name}
        </span>
      ))}
    </span>
  );
}

export function GradeCircle({ label, grade, rank, total }) {
  const color = gradeColor(grade);
  return (
    <div className="grade">
      <div className="grade-ring" style={{ background: `conic-gradient(${color} ${grade * 36}deg, var(--surface-3) 0deg)` }}>
        <div className="grade-inner">{grade}</div>
      </div>
      <b>{label}</b>
      <span className="muted small">{rank ? `#${rank} of ${total}` : ""}</span>
    </div>
  );
}

export function ShareCard({ kind, label, pct, rank, after }) {
  return (
    <div className={`share ${kind}`}>
      <div className="share-label">{label}</div>
      <div className="share-pct">{pct.toFixed(1)}%</div>
      <div className="share-rank">League rank #{rank}</div>
      {after ? (
        <div className="share-after">
          After: <b>{after.pct.toFixed(1)}%</b> · #{after.rank}
        </div>
      ) : null}
    </div>
  );
}
