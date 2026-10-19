"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Img, Pos } from "./ui";
import PlayerModal from "./PlayerModal";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const NAV = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/rankings", label: "Rankings", icon: "rankings" },
  { href: "/trade", label: "Trade", icon: "trade" },
  { href: "/roster-lab", label: "Roster Lab", icon: "lab" },
  { href: "/blueprint", label: "Blueprint", icon: "blueprint" },
  { href: "/league", label: "League", icon: "league" },
  { href: "/history", label: "History", icon: "history" },
];

function GlobalSearch() {
  const { data, openPlayer } = useApp();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || !data) return [];
    return Object.values(data.players)
      .filter((p) => p.name.toLowerCase().includes(term))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [q, data]);

  const choose = (p) => {
    openPlayer(p.id);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };
  const teamName = (rid) => data?.teams.find((t) => t.rosterId === rid)?.name;

  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input
        ref={inputRef}
        value={q}
        placeholder="Search any player…"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHl(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setHl((h) => Math.min(h + 1, results.length - 1));
          if (e.key === "ArrowUp") setHl((h) => Math.max(h - 1, 0));
          if (e.key === "Enter" && results[hl]) choose(results[hl]);
          if (e.key === "Escape") inputRef.current?.blur();
        }}
      />
      <kbd>⌘K</kbd>
      {open && results.length > 0 && (
        <div className="search-results">
          {results.map((p, i) => (
            <button key={p.id} className={`search-item${i === hl ? " hl" : ""}`} onMouseDown={() => choose(p)}>
              <Img src={p.img} className="headshot" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="pname" style={{ display: "block" }}>{p.name}</span>
                <span className="asset-meta">
                  <Pos pos={p.pos} rank={p.posRank} />
                  <span className="muted small">{p.team} · {p.owner ? teamName(p.owner) : "Free agent"}</span>
                </span>
              </span>
              <b className="small">{p.value ? p.value.toLocaleString() : ""}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Loading({ error }) {
  if (error) {
    return (
      <div className="card empty">
        <h3>Couldn't load your league</h3>
        <p className="small">{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  return (
    <div className="grid">
      <div className="skeleton" style={{ height: 60, width: 320 }} />
      <div className="stats-row">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 88 }} />)}
      </div>
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || "dark");
  }, []);
  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem("theme", nextTheme);
    } catch {}
    setTheme(nextTheme);
  };

  useEffect(() => {
    fetch("/api/league")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch((e) => setError(String(e)));
  }, []);

  // Live scores refresh every minute while the tab is open.
  useEffect(() => {
    const load = () =>
      fetch("/api/live")
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) setLive(d);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setPlayerId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = playerId ? "hidden" : "";
  }, [playerId]);

  const openPlayer = useCallback((id) => setPlayerId(String(id)), []);
  const ctx = useMemo(() => ({ data, live, openPlayer, theme }), [data, live, openPlayer, theme]);
  const me = data?.teams.find((t) => t.rosterId === data.me);

  return (
    <AppContext.Provider value={ctx}>
      <div className="shell">
        <aside className="rail">
          <div className="rail-logo">FO</div>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`rail-link${pathname === n.href ? " active" : ""}`}>
              <Icon name={n.icon} size={22} />
              {n.label}
            </Link>
          ))}
          <div className="rail-spacer" />
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="league-pill">
              <Img src={me?.avatar || data?.league.avatar} />
              <div className="league-pill-text">
                <div className="league-pill-name">{data?.league.name || "Loading league…"}</div>
                <div className="league-pill-sub">{me ? `${me.name} · ${me.wins}-${me.losses}` : "Sleeper"}</div>
              </div>
            </div>
            <GlobalSearch />
            {live && (
              <span className="chip" title={`Updated ${new Date(live.fetchedAt).toLocaleTimeString()}`}>
                <span className="live-dot" /> Week {live.week}
              </span>
            )}
            <button className="icon-btn" onClick={toggleTheme} title="Switch light / dark">
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
          </header>

          <main className="content">{data ? children : <Loading error={error} />}</main>
        </div>
      </div>
      {data && playerId && <PlayerModal key={playerId} id={playerId} onClose={() => setPlayerId(null)} />}
    </AppContext.Provider>
  );
}
